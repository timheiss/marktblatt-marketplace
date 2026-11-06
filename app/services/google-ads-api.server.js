
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


/**
 * Ausschließlich dieses Google Ads Konto darf für
 * zukünftige Kampagnenänderungen verwendet werden.
 */
export const MARKTBLATT_GOOGLE_ADS_CUSTOMER_ID = "2908836119";

export const MARKTBLATT_GOOGLE_ADS_MANAGER_ID = "7812981703";

/**
 * Zentrale Sicherheitsprüfung für schreibende
 * Google Ads API-Funktionen.
 *
 * Wirft einen Fehler, wenn ein anderes Konto
 * als Marktblatt.online angesprochen wird.
 */
export function assertMarktblattGoogleAdsCustomer(customerId) {
  const normalizedId = String(customerId ?? "")
    .replace(/-/g, "");

  if (
    normalizedId !== MARKTBLATT_GOOGLE_ADS_CUSTOMER_ID
  ) {
    throw new Error(
      "Google Ads: Kampagnenänderungen sind ausschließlich " +
      "für das Marktblatt.online-Werbekonto erlaubt."
    );
  }

  return normalizedId;
}


/**
 * Liest ausschließlich Kampagnen des Marktblatt-Werbekontos.
 * Es werden keine Änderungen an Google Ads vorgenommen.
 */
export async function listMarktblattGoogleAdsCampaigns(shop) {
  const customerId = assertMarktblattGoogleAdsCustomer(
    MARKTBLATT_GOOGLE_ADS_CUSTOMER_ID
  );

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
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.cost_micros
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date DURING THIS_MONTH
    ORDER BY campaign.id
  `;

  const response = await fetch(
    `https://googleads.googleapis.com/v25/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "login-customer-id": MARKTBLATT_GOOGLE_ADS_MANAGER_ID,
        "Content-Type": "application/json",
      },
body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    console.error(
      "Google Ads Kampagnenabfrage:",
      response.status,
      errorText.slice(0, 1500)
    );

    throw new Error(
      `Google Ads: Kampagnenabruf fehlgeschlagen (HTTP ${response.status}).`
    );
  }

  const data = await response.json();

  return (data.results ?? []).map((result) => ({
    id: String(result.campaign?.id ?? ""),
    name: result.campaign?.name ?? "Ohne Kampagnennamen",
    status: result.campaign?.status ?? "UNKNOWN",
    type:
      result.campaign?.advertisingChannelType ?? "UNKNOWN",
    dailyBudgetEuros:
      Number(result.campaignBudget?.amountMicros ?? 0) /
      1000000,
    spentThisMonthEuros:
      Number(result.metrics?.costMicros ?? 0) / 1000000,
  }));
}

/**
 * Erstellt einen eindeutigen Kampagnennamen
 * anhand der Shopify-Anbieter-ID.
 *
 * Diese Funktion führt keine Google Ads API-Anfrage aus.
 */
export function buildMarktblattVendorCampaignName(customerId) {
  const normalizedId = String(customerId ?? "").trim();

  if (!/^gid:\/\/shopify\/Customer\/[1-9]\d*$/.test(normalizedId)) {
    throw new Error(
      "Google Ads: Ungültige Shopify-Anbieter-ID."
    );
  }

  return `Marktblatt | ${normalizedId}`;
}

/**
 * Bereitet eine pausierte Google-Suchkampagne vor.
 *
 * Keine Google Ads API-Anfrage.
 * Keine Datenbankänderung.
 */
export function prepareMarktblattSearchCampaign({
  customerId,
  googleAdsCustomerId,
  dailyBudgetMicros,
}) {
  const accountId = assertMarktblattGoogleAdsCustomer(
    googleAdsCustomerId
  );

  const campaignName =
    buildMarktblattVendorCampaignName(customerId);

  if (
    !Number.isSafeInteger(dailyBudgetMicros) ||
    dailyBudgetMicros <= 0 ||
    dailyBudgetMicros % 10000 !== 0
  ) {
    throw new Error(
      "Google Ads: Ungültiges oder aufgebrauchtes Tagesbudget."
    );
  }

  return {
    googleAdsCustomerId: accountId,
    customerId: customerId.trim(),
    campaignName,
    advertisingChannelType: "SEARCH",
    status: "PAUSED",
    dailyBudgetMicros,
  };
}

/**
 * Prüft, ob für einen Anbieter bereits eine
 * Google Ads-Kampagne vorhanden ist.
 *
 * Keine API-Anfrage.
 * Keine Datenbankänderung.
 */
export function checkMarktblattVendorCampaignDuplicate({
  customerId,
  googleAdsCustomerId,
  existingMapping,
  googleAdsCampaigns,
}) {
  const accountId = assertMarktblattGoogleAdsCustomer(
    googleAdsCustomerId
  );

  const campaignName =
    buildMarktblattVendorCampaignName(customerId);

  if (!Array.isArray(googleAdsCampaigns)) {
    throw new Error(
      "Google Ads: Kampagnenliste nicht verfügbar."
    );
  }

  if (
    existingMapping &&
    existingMapping.customerId !== customerId
  ) {
    throw new Error(
      "Google Ads: Anbieter-Zuordnung stimmt nicht überein."
    );
  }

  if (
    existingMapping &&
    existingMapping.googleAdsCustomerId !== accountId
  ) {
    throw new Error(
      "Google Ads: Anbieter-Zuordnung gehört zu einem anderen Werbekonto."
    );
  }

  const mappedCampaignId =
    existingMapping?.googleCampaignId;

  if (mappedCampaignId) {
    return {
      canCreate: false,
      reason: "database_mapping_exists",
      campaignId: String(mappedCampaignId),
      campaignName,
    };
  }

  const existingCampaign = googleAdsCampaigns.find(
    (campaign) =>
      campaign.name === campaignName &&
      campaign.status !== "REMOVED"
  );

  if (existingCampaign) {
    return {
      canCreate: false,
      reason: "google_campaign_exists",
      campaignId: String(existingCampaign.id),
      campaignName,
    };
  }

  return {
    canCreate: true,
    reason: "no_duplicate_found",
    campaignId: null,
    campaignName,
  };
}