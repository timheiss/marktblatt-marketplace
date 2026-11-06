
import { randomUUID } from "node:crypto";
import prisma from "../db.server";
import {
  assertMarktblattGoogleAdsCustomer,
  buildMarktblattVendorCampaignName,
} from "./google-ads-api.server";

/**
 * Reserviert atomar das Recht, für einen Anbieter
 * eine Google Ads-Kampagne zu erstellen.
 *
 * Diese Funktion führt keine Google Ads API-Anfrage aus.
 */
export async function acquireAdsCampaignCreationLock({
  customerId,
  googleAdsCustomerId,
}) {
  const campaignName =
    buildMarktblattVendorCampaignName(customerId);

  const accountId =
    assertMarktblattGoogleAdsCustomer(googleAdsCustomerId);

  const creationToken = randomUUID();
  const creationStartedAt = new Date();

  const result = await prisma.adsVendorCampaign.updateMany({
    where: {
      customerId,
      googleAdsCustomerId: accountId,
      googleCampaignId: null,
      status: "pending",
      creationToken: null,
      creationStartedAt: null,
    },
    data: {
      status: "creating",
      creationToken,
      creationStartedAt,
      creationError: null,
    },
  });

  if (result.count !== 1) {
    return {
      acquired: false,
      reason: "campaign_not_available",
      creationToken: null,
    };
  }

  return {
    acquired: true,
    customerId,
    googleAdsCustomerId: accountId,
    campaignName,
    creationToken,
    creationStartedAt,
  };
}


/**
 * Markiert einen Kampagnenerstellungsversuch als ungeklärt.
 *
 * Eine erneute Erstellung bleibt gesperrt, bis der
 * Google Ads-Bestand kontrolliert wurde.
 *
 * Keine Google Ads API-Anfrage.
 */
export async function markAdsCampaignReconciliationRequired({
  customerId,
  googleAdsCustomerId,
  creationToken,
  errorMessage,
}) {
  const accountId =
    assertMarktblattGoogleAdsCustomer(googleAdsCustomerId);

  buildMarktblattVendorCampaignName(customerId);

  if (
    typeof creationToken !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      creationToken
    )
  ) {
    throw new Error(
      "Google Ads: Ungültiger Erstellungstoken."
    );
  }

  const safeErrorMessage =
    typeof errorMessage === "string"
      ? errorMessage.slice(0, 1000)
      : "Erstellungsergebnis konnte nicht bestätigt werden.";

  const result = await prisma.adsVendorCampaign.updateMany({
    where: {
      customerId,
      googleAdsCustomerId: accountId,
      googleCampaignId: null,
      status: "creating",
      creationToken,
    },
    data: {
      status: "reconciliation_required",
      creationError: safeErrorMessage,
    },
  });

  return {
    updated: result.count === 1,
    customerId,
    status:
      result.count === 1
        ? "reconciliation_required"
        : "unchanged",
  };
}
