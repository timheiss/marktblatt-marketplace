
import dns from "node:dns/promises";
import https from "node:https";
import ipaddr from "ipaddr.js";
import { assertVerifiedShopDomain } from "./vendor-shop-domain.server";

const MAX_HTML_SIZE = 5 * 1024 * 1024;
const FETCH_TIMEOUT = 10000;
const MAX_REDIRECTS = 5;

function assertPublicIp(value) {
  if (!ipaddr.isValid(value)) {
    throw new Error("Ungültige Netzwerkadresse.");
  }

  const address = ipaddr.parse(value);

  if (address.kind() === "ipv6" && address.isIPv4MappedAddress()) {
    return assertPublicIp(address.toIPv4Address().toString());
  }

  if (address.range() !== "unicast") {
    throw new Error("Private oder reservierte Netzwerkadresse blockiert.");
  }

  if (address.kind() === "ipv4") {
    const [a, b, c] = address.octets;

    if (
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    ) {
      throw new Error("Reservierte Netzwerkadresse blockiert.");
    }
  }

  return true;
}

function assertSecureShopUrl(value, verifiedShopUrl) {
  const url = assertVerifiedShopDomain(value, verifiedShopUrl);

  if (url.protocol !== "https:" || url.port) {
    throw new Error("Produktseiten müssen HTTPS ohne Sonderport verwenden.");
  }

  return url;
}

async function requestHtml(url, signal) {
  signal.throwIfAborted();

  const addresses = await Promise.race([
    dns.lookup(url.hostname, {
      all: true,
    }),
    new Promise((_, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }

      signal.addEventListener(
        "abort",
        () => reject(signal.reason),
        { once: true }
      );
    }),
  ]);

  signal.throwIfAborted();

  if (!addresses.length) {
    throw new Error("Die Shop-Domain konnte nicht aufgelöst werden.");
  }

  for (const entry of addresses) {
    assertPublicIp(entry.address);
  }

  const selected = addresses[0];

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;

      if (error) reject(error);
      else resolve(result);
    };

    const req = https.request(
      url,
      {
        method: "GET",
        agent: false,
        signal,
        autoSelectFamily: false,
        lookup: (_hostname, _options, callback) => {
          callback(null, selected.address, selected.family);
        },
        servername: url.hostname,
        rejectUnauthorized: true,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MarktblattProductImporter/1.0)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode || 0;

if ([301, 302, 303, 307, 308].includes(status)) {
  const location = response.headers.location;

  finish(null, { status, location });
  response.destroy();

  return;
}

        if (status < 200 || status >= 300) {
          response.destroy();
          finish(new Error(`Die Produktseite antwortet mit HTTP ${status}.`));
          return;
        }

        const contentType = String(response.headers["content-type"] || "");

        if (!contentType.toLowerCase().includes("text/html")) {
          response.destroy();
          finish(new Error("Die angegebene Adresse ist keine HTML-Produktseite."));
          return;
        }

        const declaredLength = Number(response.headers["content-length"] || 0);

        if (!Number.isFinite(declaredLength) || declaredLength > MAX_HTML_SIZE) {
          response.destroy();
          finish(new Error("Die Produktseite ist zu groß."));
          return;
        }

        const chunks = [];
        let received = 0;

        response.on("data", (chunk) => {
          received += chunk.length;

if (received > MAX_HTML_SIZE) {
  const error = new Error("Die Produktseite ist zu groß.");

  finish(error);
  response.destroy();

  return;
}

          chunks.push(chunk);
        });

        response.on("end", () => {
          finish(null, {
            status,
            html: Buffer.concat(chunks).toString("utf8"),
          });
        });

        response.on("error", (error) => finish(error));
      }
    );

    req.on("error", (error) => finish(error));
    req.end();
  });
}

export async function secureDownloadHtml(startUrl, verifiedShopUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    let currentUrl = assertSecureShopUrl(startUrl, verifiedShopUrl);

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      const response = await requestHtml(currentUrl, controller.signal);

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.location) {
          throw new Error("Ungültige Weiterleitung der Produktseite.");
        }

        if (redirectCount === MAX_REDIRECTS) {
          throw new Error("Die Produktseite hat zu viele Weiterleitungen.");
        }

        const redirectedUrl = new URL(response.location, currentUrl);

        currentUrl = assertSecureShopUrl(
          redirectedUrl.href,
          verifiedShopUrl
        );

        continue;
      }

      return {
        html: response.html,
        finalUrl: currentUrl.href,
      };
    }

    throw new Error("Die Produktseite hat zu viele Weiterleitungen.");
  } finally {
    clearTimeout(timeout);
  }
}
