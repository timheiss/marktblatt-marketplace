import prisma from "../db.server";
import { decryptGoogleToken } from "./google-token-crypto.server";
import { refreshGoogleOAuthAccessToken } from "./google-oauth-token.server";
import {
  MARKTBLATT_GOOGLE_ADS_CUSTOMER_ID,
  MARKTBLATT_GOOGLE_ADS_MANAGER_ID,
  assertMarktblattGoogleAdsCustomer,
  buildMarktblattVendorCampaignName,
} from "./google-ads-api.server";

/**
 * Liest die Monatsausgaben der eindeutig zugeordneten
 * Marktblatt-Anbieter-Kampagnen.
 *
 * Keine Datenbankänderungen.
 * Keine Google Ads Schreibzugriffe.
 */
export async function readMarktblattVendorCampaignSpend(shop) {
  const accountId = assertMarktblattGoogleAdsCustomer(
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
    throw new Error("Google Ads: Keine aktive Verbindung vorhanden.");
  }

  const mappings = await prisma.adsVendorCampaign.findMany({
    where: {
      googleAdsCustomerId: accountId,
      googleCampaignId: { not: null },
    },
    select: {
      customerId: true,
      googleCampaignId: true,
    },
  });

  if (mappings.length === 0) {
    return [];
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
      metrics.cost_micros
    FROM campaign
    WHERE segments.date DURING THIS_MONTH
    ORDER BY campaign.id
  `;

  const results = [];
  const seenTokens = new Set();
  let pageToken = null;

  do {
    const response = await fetch(
      `https://googleads.googleapis.com/v25/customers/${accountId}/googleAds:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "login-customer-id": MARKTBLATT_GOOGLE_ADS_MANAGER_ID,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          ...(pageToken ? { pageToken } : {}),
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Google Ads: Ausgabenabfrage fehlgeschlagen (HTTP ${response.status}).`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data.results)) {
      throw new Error("Google Ads: Ungültige Ausgabenantwort.");
    }

    results.push(...data.results);

    pageToken = data.nextPageToken || null;

    if (pageToken) {
      if (seenTokens.has(pageToken)) {
        throw new Error("Google Ads: Wiederholter Seiten-Token.");
      }

      seenTokens.add(pageToken);
    }
  } while (pageToken);

  const campaignsById = new Map();

  for (const result of results) {
    const campaign = result.campaign;
    const id = String(campaign?.id ?? "");

    if (!/^[1-9]\d*$/.test(id)) {
      throw new Error("Google Ads: Ungültige Kampagnen-ID.");
    }

    if (campaignsById.has(id)) {
      throw new Error("Google Ads: Kampagne mehrfach zurückgegeben.");
    }

    const rawMicros = result.metrics?.costMicros;

    if (
      rawMicros === undefined ||
      rawMicros === null ||
      !/^\d+$/.test(String(rawMicros))
    ) {
      throw new Error("Google Ads: Ungültige Ausgaben.");
    }

    const costMicros = BigInt(rawMicros);

    campaignsById.set(id, {
      name: campaign.name,
      status: campaign.status,
      costMicros,
    });
  }

  return mappings.map((mapping) => {
    const campaignId = String(mapping.googleCampaignId);
    const campaign = campaignsById.get(campaignId);

    if (!campaign) {
      throw new Error(
        `Google Ads: Zugeordnete Kampagne ${campaignId} nicht gefunden.`
      );
    }

    const expectedName = buildMarktblattVendorCampaignName(
      mapping.customerId
    );

    if (campaign.name !== expectedName) {
      throw new Error(
        `Google Ads: Anbieterzuordnung für Kampagne ${campaignId} ungültig.`
      );
    }

    // Auf volle Cent aufrunden, damit das verfügbare
    // Restbudget nicht überschätzt wird.
    const spentCentsBigInt =
      (campaign.costMicros + 9999n) / 10000n;

    if (spentCentsBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("Google Ads: Ausgabenwert zu groß.");
    }

    return {
      customerId: mapping.customerId,
      googleCampaignId: campaignId,
      status: campaign.status,
      spentBudgetCents: Number(spentCentsBigInt),
    };
  });
}