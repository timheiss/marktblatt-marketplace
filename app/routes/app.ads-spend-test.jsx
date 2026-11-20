import prisma from "../db.server";
import { authenticateAdsAdmin } from "../services/ads-admin-auth.server";
import { readMarktblattVendorCampaignSpend } from "../services/ads-spend-sync.server";

/**
 * Geschützter, ausschließlich lesender Google Ads Test.
 *
 * Keine Datenbankänderungen.
 * Keine Kampagnenerstellung.
 * Keine Budgetänderungen.
 */
export const loader = async ({ request }) => {
  const { session } = await authenticateAdsAdmin(request);

  try {
    const mappings = await prisma.adsVendorCampaign.findMany({
      select: {
        customerId: true,
        googleCampaignId: true,
        status: true,
      },
    });

    const linkedMappings = mappings.filter(
      (mapping) => mapping.googleCampaignId !== null
    );

    const campaigns = await readMarktblattVendorCampaignSpend(
      session.shop
    );

    return Response.json({
      success: true,
      totalMappings: mappings.length,
      pendingMappings: mappings.filter(
        (mapping) => mapping.status === "pending"
      ).length,
      linkedCampaigns: linkedMappings.length,
      googleAdsSpendQueried: linkedMappings.length > 0,
      campaignCount: campaigns.length,
      campaigns,
    });
  } catch (error) {
    console.error(
      "Marktblatt Google Ads Ausgabenprüfung:",
      error.message
    );

    return Response.json(
      {
        success: false,
        message: "Google Ads Ausgaben konnten nicht abgerufen werden.",
      },
      { status: 502 }
    );
  }
};