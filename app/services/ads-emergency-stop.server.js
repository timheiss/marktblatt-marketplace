import prisma from "../db.server";

const SETTINGS_ID = "global";

/**
 * Liest den zentralen Notfall-Stopp.
 * Falls noch kein Datensatz existiert, wird sicherheitshalber
 * keine Freigabe für Kampagnenänderungen erteilt.
 */
export async function getAdsEmergencyStopStatus() {
  const settings = await prisma.adsManagerSettings.findUnique({
    where: { id: SETTINGS_ID },
  });

  return {
    enabled: settings?.emergencyStopEnabled ?? true,
    initialized: Boolean(settings),
    activatedAt: settings?.activatedAt ?? null,
    activatedBy: settings?.activatedBy ?? null,
  };
}

/**
 * Verhindert Kampagnenerstellungen und Aktivierungen,
 * wenn der Notfall-Stopp aktiv oder nicht initialisiert ist.
 */
export async function assertAdsManagerNotStopped() {
  const status = await getAdsEmergencyStopStatus();

  if (status.enabled) {
    throw new Error(
      "Marktblatt KI Ads Manager: Notfall-Stopp aktiv oder nicht initialisiert."
    );
  }

  return true;
}

/**
 * Aktiviert die Notfall-Sperre dauerhaft.
 * Diese Funktion pausiert noch keine Google Ads-Kampagnen.
 */
export async function activateAdsEmergencyStop({ administratorId }) {
  if (
    typeof administratorId !== "string" ||
    !administratorId.trim()
  ) {
    throw new Error("Ungültiger Administrator.");
  }

  return prisma.adsManagerSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      emergencyStopEnabled: true,
      activatedAt: new Date(),
      activatedBy: administratorId.trim(),
    },
    update: {
      emergencyStopEnabled: true,
      activatedAt: new Date(),
      activatedBy: administratorId.trim(),
    },
  });
}

/**
 * Ermittelt Kampagnenerstellungen, deren Ergebnis
 * beim Notfall-Stopp noch nicht abschließend geklärt ist.
 *
 * Keine Google Ads API-Anfrage.
 */
export async function getAdsEmergencyStopPendingCampaigns() {
  const campaigns = await prisma.adsVendorCampaign.findMany({
    where: {
      googleAdsCustomerId: "2908836119",
      status: {
        in: ["creating", "reconciliation_required"],
      },
    },
    select: {
      customerId: true,
      googleCampaignId: true,
      status: true,
      creationStartedAt: true,
    },
  });

  return {
    hasPendingCampaigns: campaigns.length > 0,
    count: campaigns.length,
    campaigns,
  };
}