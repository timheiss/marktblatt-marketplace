
import prisma from "../db.server";
import { decryptGoogleToken } from "./google-token-crypto.server";
import { refreshGoogleOAuthAccessToken } from "./google-oauth-token.server";

export async function listGoogleAdsAccounts(shop) {
  const connection = await prisma.googleAdsConnection.findUnique({
    where: { shop },
    select: {
      encryptedRefreshToken: true,
      status: true,
    },
  });

  if (
    connection?.status !== "connected" ||
    !connection.encryptedRefreshToken
  ) {
    throw new Error("Google Ads: Keine aktive Verbindung vorhanden.");
  }

  const refreshToken = decryptGoogleToken(
    connection.encryptedRefreshToken
  );

  const accessToken = await refreshGoogleOAuthAccessToken(
    refreshToken
  );

  const response = await fetch(
"https://googleads.googleapis.com/v25/customers:listAccessibleCustomers",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Google Ads: Kontenabfrage fehlgeschlagen (HTTP ${response.status}).`
    );
  }

  const data = await response.json();

  return data.resourceNames ?? [];
}


export async function getGoogleAdsAccountDetails(shop, customerId) {
  if (!/^\d{10}$/.test(String(customerId))) {
    throw new Error("Google Ads: Ungültige Kundennummer.");
  }

  const connection = await prisma.googleAdsConnection.findUnique({
    where: { shop },
    select: {
      encryptedRefreshToken: true,
      status: true,
    },
  });

  if (
    connection?.status !== "connected" ||
    !connection.encryptedRefreshToken
  ) {
    throw new Error("Google Ads: Keine aktive Verbindung vorhanden.");
  }

  const refreshToken = decryptGoogleToken(
    connection.encryptedRefreshToken
  );

  const accessToken = await refreshGoogleOAuthAccessToken(
    refreshToken
  );

  const query = `
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.manager,
      customer.status,
      customer.currency_code
    FROM customer
    LIMIT 1
  `;

  const response = await fetch(
    `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Google Ads: Kontodetails fehlgeschlagen (HTTP ${response.status}).`
    );
  }

  const data = await response.json();
  const customer = data.results?.[0]?.customer;

  if (!customer) {
    throw new Error("Google Ads: Keine Kontodetails erhalten.");
  }

  return {
    id: String(customer.id ?? customerId),
    name: customer.descriptiveName ?? "Ohne Kontonamen",
    isManager: customer.manager === true,
    status: customer.status ?? "UNKNOWN",
    currency: customer.currencyCode ?? "",
  };
}


export async function listGoogleAdsManagerAccounts(shop) {
  const managerCustomerId = "7812981703";

  const connection = await prisma.googleAdsConnection.findUnique({
    where: { shop },
    select: {
      encryptedRefreshToken: true,
      status: true,
    },
  });

  if (
    connection?.status !== "connected" ||
    !connection.encryptedRefreshToken
  ) {
    throw new Error(
      "Google Ads: Keine aktive Verbindung vorhanden."
    );
  }

  const refreshToken = decryptGoogleToken(
    connection.encryptedRefreshToken
  );

  const accessToken = await refreshGoogleOAuthAccessToken(
    refreshToken
  );

  const query = `
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.manager,
      customer_client.status,
      customer_client.currency_code,
      customer_client.level
    FROM customer_client
    WHERE customer_client.level <= 1
  `;

  const response = await fetch(
    `https://googleads.googleapis.com/v25/customers/${managerCustomerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Google Ads: MCC-Kontenabfrage fehlgeschlagen (HTTP ${response.status}).`
    );
  }

  const data = await response.json();

  return (data.results ?? [])
    .map((result) => result.customerClient)
    .filter((account) => account && Number(account.level) === 1)
    .map((account) => ({
      id: String(account.id),
      name: account.descriptiveName ?? "Ohne Kontonamen",
      isManager: account.manager === true,
      status: account.status ?? "UNKNOWN",
      currency: account.currencyCode ?? "",
    }));
}
