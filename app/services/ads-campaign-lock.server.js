
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
