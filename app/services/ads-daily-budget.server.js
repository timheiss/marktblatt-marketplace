/**
 * Marktblatt KI Ads Manager
 *
 * Berechnet das durchschnittliche Google Ads-Tagesbudget.
 *
 * Sicherheitsreserve: 10 %
 * Berechnung: 90 % des Restbudgets / verbleibende Tage
 *
 * Diese Funktion führt keine Google Ads API-Anfragen aus.
 */

const SAFETY_RESERVE_PERCENT = 10;

export function calculateVendorDailyBudget({
  allocatedBudgetCents,
  spentBudgetCents,
  date = new Date(),
}) {
  if (
    !Number.isSafeInteger(allocatedBudgetCents) ||
    !Number.isSafeInteger(spentBudgetCents) ||
    allocatedBudgetCents < 0 ||
    spentBudgetCents < 0 ||
    !(date instanceof Date) ||
    Number.isNaN(date.getTime())
  ) {
    throw new Error("Ungültige Angaben zur Budgetberechnung.");
  }

  const remainingBudgetCents = Math.max(
    0,
    allocatedBudgetCents - spentBudgetCents
  );

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  const getPart = (type) =>
    Number(parts.find((part) => part.type === type)?.value);

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");

  const daysInMonth = new Date(
    Date.UTC(year, month, 0)
  ).getUTCDate();

  const remainingDays = daysInMonth - day + 1;

  // Ganzzahlige Cent-Berechnung, immer abrunden.
  const usableBudgetCents = Math.floor(
    (remainingBudgetCents * (100 - SAFETY_RESERVE_PERCENT)) /
      100
  );

  const dailyBudgetCents = Math.floor(
    usableBudgetCents / remainingDays
  );

  return {
    remainingBudgetCents,
    safetyReservePercent: SAFETY_RESERVE_PERCENT,
    usableBudgetCents,
    remainingDays,
    dailyBudgetCents,
    dailyBudgetMicros: dailyBudgetCents * 10000,
    budgetExhausted: remainingBudgetCents === 0,
canCreateCampaign: dailyBudgetCents > 0,
  };
}