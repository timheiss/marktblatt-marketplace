import prisma from "../db.server";
import { authenticateAdsAdmin } from "../services/ads-admin-auth.server";
import { validateMarktblattCampaignCreation } from "../services/ads-campaign-create.server";

/**
 * Geschützte, ausschließlich lesende Kampagnenvalidierung.
 *
 * Keine Google Ads API-Schreibzugriffe.
 * Keine Datenbankänderungen.
 * Keine Kampagnenerstellung.
 */
export const loader = async ({ request }) => {
  const { admin } = await authenticateAdsAdmin(request);

  try {
    const mappings = await prisma.adsVendorCampaign.findMany({
      where: {
        googleAdsCustomerId: "2908836119",
        status: "pending",
        googleCampaignId: null,
      },
      select: {
        customerId: true,
      },
    });

    const results = [];

    for (const mapping of mappings) {
      try {
        const validation = await validateMarktblattCampaignCreation({
          customerId: mapping.customerId,
          admin,
        });

        results.push({
          customerId: mapping.customerId,
          valid: true,
          month: validation.month,
          campaignName: validation.campaignName,
          dailyBudgetCents: validation.dailyBudgetCents,
          remainingBudgetCents: validation.remainingBudgetCents,
          remainingDays: validation.remainingDays,
        });
      } catch (error) {
        results.push({
          customerId: mapping.customerId,
          valid: false,
          message: error.message,
        });
      }
    }

    return Response.json({
      success: true,
      checkedVendors: results.length,
      validVendors: results.filter((result) => result.valid).length,
      results,
    });
  } catch (error) {
    console.error(
      "Marktblatt Kampagnenvalidierung:",
      error.message
    );

    return Response.json(
      {
        success: false,
        message: "Kampagnenvalidierung konnte nicht ausgeführt werden.",
      },
      { status: 502 }
    );
  }
};