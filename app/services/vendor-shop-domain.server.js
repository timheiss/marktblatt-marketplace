
import db from "../db.server";
import { isIP } from "node:net";

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

export function parseVendorShopUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Keine gültige Shop-URL vorhanden.");
  }

  const url = new URL(value.trim());

  if (
    !["https:", "http:"].includes(url.protocol) ||
    !url.hostname.includes(".") ||
    url.username ||
    url.password ||
    url.port ||
    isIP(url.hostname) ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal")
  ) {
    throw new Error("Keine zulässige öffentliche Shop-Adresse.");
  }

  url.hash = "";
  return url;
}

export function assertVerifiedShopDomain(
  productUrl,
  verifiedShopUrl
) {
  const product = parseVendorShopUrl(productUrl);
  const verified = parseVendorShopUrl(verifiedShopUrl);

  if (
    normalizeHostname(product.hostname) !==
    normalizeHostname(verified.hostname)
  ) {
    throw new Error(
      "Diese URL gehört nicht zum verifizierten Onlineshop."
    );
  }

  return product;
}

export async function getVerifiedVendorShop(customerId) {
  if (!customerId) {
    throw new Error("Keine gültige Anbieterkennung.");
  }

  const profile = await db.vendorProfile.findUnique({
    where: { customerId },
    select: {
      verificationStatus: true,
      verificationShopUrl: true,
    },
  });

  if (
    profile?.verificationStatus !== "verified" ||
    !profile.verificationShopUrl
  ) {
    throw new Error(
      "Der Produktimport ist erst nach erfolgreicher Anbieter-Verifizierung möglich."
    );
  }

  const shopUrl = parseVendorShopUrl(
    profile.verificationShopUrl
  );

  if (shopUrl.protocol !== "https:") {
    throw new Error(
      "Der verifizierte Onlineshop muss HTTPS verwenden."
    );
  }

  return {
    shopUrl: shopUrl.href,
    origin: shopUrl.origin,
    hostname: shopUrl.hostname,
  };
}
