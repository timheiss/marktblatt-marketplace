
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import * as cheerio from "cheerio";

const MAX_SITEMAPS = 20;
const MAX_PRODUCTS = 500;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function publicIPv4(ip) {
  if (isIP(ip) !== 4) return false;

  const n = ip.split(".").map(Number);
  const [a, b, c] = n;

  if (
    a === 0 || a === 10 || a === 127 ||
    a >= 224 || a === 100 && b >= 64 && b <= 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && (b === 0 || b === 168) ||
    a === 198 && (b === 18 || b === 19) ||
    a === 198 && b === 51 && c === 100 ||
    a === 203 && b === 0 && c === 113 ||
    a === 192 && b === 0 && c === 2 ||
    a === 192 && b === 88 && c === 99
  ) return false;

  return true;
}

function parseUrl(value) {
  const url = new URL(String(value).trim());

  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    isIP(url.hostname) ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal") ||
    url.hostname.endsWith(".localhost")
  ) {
    throw new Error("Keine zulässige öffentliche Shop-Adresse.");
  }

  url.hash = "";
  return url;
}

function sameShop(url, hostname) {
  const normalize = (host) =>
    host.toLowerCase().replace(/^www\./, "");

  return normalize(url.hostname) === normalize(hostname);
}

async function fetchText(input, hostname, redirects = 0) {
  if (redirects > MAX_REDIRECTS) {
    throw new Error("Zu viele Weiterleitungen.");
  }

  const url = parseUrl(input);

  if (!sameShop(url, hostname)) {
    throw new Error("Weiterleitung auf eine fremde Domain.");
  }

  // Nur öffentliche IPv4-Adressen zulassen und die
  // geprüfte Adresse beim Verbindungsaufbau festhalten.
  const addresses = await lookup(url.hostname, {
    all: true,
    family: 4,
  });

  if (
    !addresses.length ||
    addresses.some((entry) => !publicIPv4(entry.address))
  ) {
    throw new Error("Die Shop-Domain hat keine zulässige IP-Adresse.");
  }

  const pinnedAddress = addresses[0].address;
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.get(
      url,
      {
        timeout: TIMEOUT_MS,
        agent: false,
        lookup: (_hostname, _options, callback) => {
          callback(null, pinnedAddress, 4);
        },
        headers: {
          "User-Agent": "Marktblatt-Shop-Discovery/1.0",
          Accept: "application/xml,text/xml,text/plain,*/*",
        },
      },
      async (res) => {
        const status = res.statusCode || 0;

        if (status >= 300 && status < 400) {
          const location = res.headers.location;
          res.resume();

          if (!location) {
            reject(new Error("Weiterleitung ohne Ziel."));
            return;
          }

          try {
            resolve(
              await fetchText(
                new URL(location, url).href,
                hostname,
                redirects + 1
              )
            );
          } catch (error) {
            reject(error);
          }
          return;
        }

        if (status !== 200) {
          res.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }

        const chunks = [];
        let size = 0;

        res.on("data", (chunk) => {
          size += chunk.length;

          if (size > MAX_BYTES) {
            res.destroy(
              new Error("Sitemap überschreitet die Größenbegrenzung.")
            );
            return;
          }

          chunks.push(chunk);
        });

        res.on("end", () => {
          resolve(Buffer.concat(chunks).toString("utf8"));
        });

        res.on("error", reject);
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Zeitüberschreitung."));
    });

    req.on("error", reject);
  });
}

function looksLikeProduct(url, productSitemap) {
  if (productSitemap) return true;

  return /\/(products|product|produkt|produkte|artikel|p)\//i.test(
    url.pathname
  );
}

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin":
          "https://extensions.shopifycdn.com",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type",
        "Access-Control-Allow-Methods":
          "POST, OPTIONS",
      },
    });
  }

  return Response.json(
    { success: false, error: "Methode nicht erlaubt." },
    { status: 405 }
  );
};

export const action = async ({ request }) => {
  let cors = (response) => response;

  try {
    const auth = await authenticate.public.customerAccount(request);
    cors = auth.cors;

    const customerId = auth.sessionToken?.sub;

    if (!customerId) {
      return cors(Response.json(
        { success: false, error: "Nicht angemeldet." },
        { status: 401 }
      ));
    }

    const subscription = await db.subscription.findUnique({
      where: { customerId },
    });

    const allowedPackages = [
      "business",
      "professional",
      "enterprise",
    ];

    if (
      subscription?.status?.toLowerCase() !== "active" ||
      !allowedPackages.includes(
        subscription?.package?.trim().toLowerCase()
      )
    ) {
      return cors(Response.json(
        {
          success: false,
          error: "Der automatische Shop-Import ist ab Business verfügbar.",
        },
        { status: 403 }
      ));
    }

    const body = await request.json();
    const shopUrl = parseUrl(body?.url);
    const origin = shopUrl.origin;
    const hostname = shopUrl.hostname;

    const queue = [
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
      `${origin}/wp-sitemap.xml`,
    ];

    try {
      const robots = await fetchText(
        `${origin}/robots.txt`,
        hostname
      );

      for (const match of robots.matchAll(/^sitemap:\s*(.+)$/gim)) {
        const sitemap = new URL(match[1].trim(), origin);

        if (sameShop(sitemap, hostname)) {
          queue.push(sitemap.href);
        }
      }
    } catch {
      // robots.txt ist optional.
    }

    const visited = new Set();
    const products = new Set();

    while (
      queue.length > 0 &&
      visited.size < MAX_SITEMAPS &&
      products.size < MAX_PRODUCTS
    ) {
      const sitemapUrl = queue.shift();

      if (visited.has(sitemapUrl)) continue;
      visited.add(sitemapUrl);

      let xml;

      try {
        xml = await fetchText(sitemapUrl, hostname);

        console.log(
          "SHOP DISCOVERY SITEMAP OK:",
          sitemapUrl,
          "Zeichen:",
          xml.length
        );

      } catch (error) {
        console.error(
          "SHOP DISCOVERY SITEMAP FAILED:",
          sitemapUrl,
          error.message
        );

        continue;
      }

      const $ = cheerio.load(xml, { xmlMode: true });
      const isIndex = $("sitemapindex").length > 0;
      const isProductSitemap =
        /product|produkt|artikel/i.test(
          new URL(sitemapUrl).pathname
        );

      if (isIndex) {
        $("sitemap > loc").each((_index, element) => {
          try {
            const next = parseUrl($(element).text());

            if (
              sameShop(next, hostname) &&
              !visited.has(next.href)
            ) {
              queue.push(next.href);
            }
          } catch {
            // Ungültige Sitemap ignorieren.
          }
        });
        continue;
      }

      $("urlset > url > loc").each((_index, element) => {
        if (products.size >= MAX_PRODUCTS) return false;

        try {
          const productUrl = parseUrl($(element).text());

          if (
            sameShop(productUrl, hostname) &&
            looksLikeProduct(productUrl, isProductSitemap)
          ) {
            products.add(productUrl.href);
          }
        } catch {
          // Ungültige Produkt-URL ignorieren.
        }
      });
    }

    return cors(Response.json({
      success: true,
      shopUrl: origin,
      count: products.size,
      products: [...products],
      sitemapsChecked: visited.size,
      truncated:
        products.size >= MAX_PRODUCTS ||
        (queue.length > 0 && visited.size >= MAX_SITEMAPS),
    }));
  } catch (error) {
    console.error("SHOP DISCOVERY ERROR:", error);

    return cors(Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Die Shop-Erkennung ist fehlgeschlagen.",
      },
      { status: 400 }
    ));
  }
};
