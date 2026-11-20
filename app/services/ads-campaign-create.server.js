import prisma from "../db.server";
import { checkVendorOnlineStorePublication } from "./ads-shopify-publication.server";
import { calculateVendorDailyBudget } from "./ads-daily-budget.server";
import { assertAdsManagerNotStopped } from "./ads-emergency-stop.server";
import {
  MARKTBLATT_GOOGLE_ADS_CUSTOMER_ID,
  buildMarktblattVendorCampaignName,
  prepareMarktblattSearchCampaign,
} from "./google-ads-api.server";

function getBerlinMonth(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Ungültiges Datum.");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  if (!year || !month) {
    throw new Error("Abrechnungsmonat konnte nicht ermittelt werden.");
  }

  return `${year}-${month}`;
}

/**
 * Prüft die Voraussetzungen für eine Marktblatt-Anbieter-Kampagne.
 *
 * Ausschließlich lesend:
 * - Keine Google Ads API-Schreibzugriffe
 * - Keine Datenbankänderungen
 * - Keine Kampagnenerstellung
 */
export async function validateMarktblattCampaignCreation({
  customerId,
  admin,
  date = new Date(),
}) {
  const campaignName = buildMarktblattVendorCampaignName(customerId);

  await assertAdsManagerNotStopped();

  const month = getBerlinMonth(date);

  const [subscription, vendorProfile, activeProduct, allocation, mapping] =
    await Promise.all([
      prisma.subscription.findFirst({
        where: {
          customerId,
          status: "active",
        },
        select: {
          package: true,
        },
      }),

      prisma.vendorProfile.findFirst({
        where: {
          customerId,
          verificationStatus: "verified",
        },
        select: {
          customerId: true,
        },
      }),

      prisma.marketplaceProduct.findFirst({
        where: {
          customerId,
          status: "active",
          adminLocked: false,
          shopifyProductId: { not: null },
        },
        select: {
          id: true,
        },
      }),

      prisma.adsVendorAllocation.findUnique({
        where: {
          customerId_month: {
            customerId,
            month,
          },
        },
      }),

      prisma.adsVendorCampaign.findUnique({
        where: { customerId },
      }),
    ]);

  if (!subscription || !vendorProfile || !activeProduct) {
    throw new Error(
      "Anbieter ist aktuell nicht für Google Ads berechtigt."
    );
  }

  if (!allocation) {
    throw new Error(
      `Für ${month} ist kein Anbieter-Werbebudget zugewiesen.`
    );
  }

  if (
    allocation.package.toLowerCase() !==
    subscription.package?.toLowerCase()
  ) {
    throw new Error(
      "Anbieterpaket und gespeicherte Budgetzuweisung stimmen nicht überein."
    );
  }

  if (
    !mapping ||
    mapping.googleAdsCustomerId !== MARKTBLATT_GOOGLE_ADS_CUSTOMER_ID ||
    mapping.googleCampaignId !== null ||
    mapping.status !== "pending" ||
    mapping.creationToken !== null ||
    mapping.creationStartedAt !== null
  ) {
    throw new Error(
      "Anbieter-Kampagne ist nicht für eine neue Erstellung verfügbar."
    );
  }

  const publication = await checkVendorOnlineStorePublication({
    customerId,
    admin,
  });

  if (!publication.eligible) {
    throw new Error(
      "Anbieter besitzt kein aktives, im Shopify-Onlineshop veröffentlichtes Produkt."
    );
  }
  const budget = calculateVendorDailyBudget({
    allocatedBudgetCents: allocation.allocatedBudgetCents,
    spentBudgetCents: allocation.spentBudgetCents,
    date,
  });

  if (!budget.canCreateCampaign) {
    throw new Error(
      "Das verbleibende Tagesbudget reicht nicht für eine Kampagne aus."
    );
  }

  const campaign = prepareMarktblattSearchCampaign({
    customerId,
    googleAdsCustomerId: MARKTBLATT_GOOGLE_ADS_CUSTOMER_ID,
    dailyBudgetMicros: budget.dailyBudgetMicros,
  });

  return {
    valid: true,
    customerId,
    month,
    campaignName,
    campaign,
    allocatedBudgetCents: allocation.allocatedBudgetCents,
    spentBudgetCents: allocation.spentBudgetCents,
    remainingBudgetCents: budget.remainingBudgetCents,
    safetyReservePercent: budget.safetyReservePercent,
    dailyBudgetCents: budget.dailyBudgetCents,
    remainingDays: budget.remainingDays,
  };
}