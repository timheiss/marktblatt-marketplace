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
    const campaigns = await readMarktblattVendorCampaignSpend(
      session.shop
    );

    return Response.json({
      success: true,
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