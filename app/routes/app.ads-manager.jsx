

import { useEffect, useRef, useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticateAdsAdmin } from "../services/ads-admin-auth.server";
import prisma from "../db.server";
import { ensureMonthlyPackageBudgets } from "../services/ads-monthly-budget.server";
import {
  listGoogleAdsAccounts,
  getGoogleAdsAccountDetails,
  listGoogleAdsManagerAccounts,
  listMarktblattGoogleAdsCampaigns,
} from "../services/google-ads-api.server";

const PACKAGES = [
  { name: "Starter", products: 10 },
  { name: "Business", products: 100 },
  { name: "Professional", products: 250 },
  { name: "Enterprise", products: 600 },
];



function getBerlinMonthInfo(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const getPart = (type) =>
    Number(parts.find((part) => part.type === type)?.value);

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");

  const daysInMonth = new Date(
    Date.UTC(year, month, 0)
  ).getUTCDate();

  return {
    month: `${year}-${String(month).padStart(2, "0")}`,
    day,
    daysInMonth,
  };
}

function calculateProratedBudget(
  monthlyBudgetCents,
  date = new Date()
) {
  const { day, daysInMonth } = getBerlinMonthInfo(date);

  const remainingDays = daysInMonth - day + 1;

  return Math.round(
    (monthlyBudgetCents * remainingDays) / daysInMonth
  );
}

export const loader = async ({ request }) => {
  const { session } = await authenticateAdsAdmin(request);

  const googleAdsConnection =
    await prisma.googleAdsConnection.findUnique({
      where: {
        shop: session.shop,
      },
      select: {
        status: true,
      },
    });

  const googleAdsConnected =
    googleAdsConnection?.status === "connected";

  let googleAdsAccounts = [];
  let googleAdsAccountsError = null;
  let googleAdsAccountDetails = [];

  let googleAdsManagerAccounts = [];
  let googleAdsManagerAccountsError = null;

  if (googleAdsConnected) {
    try {
      googleAdsManagerAccounts =
        await listGoogleAdsManagerAccounts(session.shop);
    } catch (error) {
      console.error(
        "Google Ads MCC-Kontenabruf fehlgeschlagen:",
        error.message
      );

      googleAdsManagerAccountsError =
        "Die MCC-Unterkonten konnten nicht geladen werden.";
    }
  }

  if (googleAdsConnected) {
    try {
      googleAdsAccounts = await listGoogleAdsAccounts(
        session.shop
      );

      googleAdsAccountDetails = await Promise.all(
googleAdsAccounts
  .filter(
    (resourceName) =>
      resourceName.split("/")[1] !== "7243645600"
  )
  .map(async (resourceName) => {
    const customerId = resourceName.split("/")[1];

    try {
            return await getGoogleAdsAccountDetails(
              session.shop,
              customerId
            );
          } catch (error) {
            console.error(
              `Google Ads Kontodetails ${customerId}:`,
              error.message
            );

            return {
              id: customerId,
              name: "Kontodetails nicht verfügbar",
              isManager: false,
              status: "UNKNOWN",
              currency: "",
            };
          }
        })
      );

    } catch (error) {
      console.error(
        "Google Ads Kontenabruf fehlgeschlagen:",
        error.message
      );

      googleAdsAccountsError =
        "Google Ads Konten konnten nicht geladen werden.";
    }
  }

  // Kampagnen ausschließlich aus Marktblatt.online lesen.
  let googleAdsCampaigns = [];
  let googleAdsCampaignsError = null;

  if (googleAdsConnected) {
    try {
      googleAdsCampaigns =
        await listMarktblattGoogleAdsCampaigns(session.shop);
    } catch (error) {
      console.error(
        "Google Ads Kampagnenabruf fehlgeschlagen:",
        error.message
      );

      googleAdsCampaignsError =
        "Die Marktblatt-Kampagnen konnten nicht geladen werden.";
    }
  }

  // Google Ads Konten zusammenführen und Duplikate entfernen.
  const excludedGoogleAdsAccountIds = new Set([
    "7243645600",
  ]);

  const combinedGoogleAdsAccounts = Array.from(
    new Map(
      [
        ...googleAdsAccountDetails,
        ...googleAdsManagerAccounts,
      ]
        .filter(
          (account) =>
            account?.id &&
            !excludedGoogleAdsAccountIds.has(account.id)
        )
        .map((account) => [account.id, account])
    ).values()
  ).sort((a, b) => {
    if (a.id === "2908836119") return -1;
    if (b.id === "2908836119") return 1;
    return a.name.localeCompare(b.name, "de");
  });

  // Gültige Monatsbudgets automatisch bereitstellen
  await ensureMonthlyPackageBudgets();


const [
  budgets,
  subscriptions,
  verifiedProfiles,
  activeProducts,
  monthlyAllocations,
  currentMonthlyBudgets,
  nextMonthlyBudgets,
    vendorCampaigns,
] = await Promise.all([
    prisma.adsPackageBudget.findMany(),

    prisma.subscription.findMany({
      where: {
        status: "active",
      },
      select: {
        customerId: true,
        package: true,
      },
    }),

    prisma.vendorProfile.findMany({
      where: {
        verificationStatus: "verified",
      },
      select: {
        customerId: true,
      },
    }),

    prisma.marketplaceProduct.findMany({
      where: {
        status: "active",
        adminLocked: false,
        shopifyProductId: {
          not: null,
        },
      },
      select: {
        customerId: true,
      },
      distinct: ["customerId"],
    }),

    prisma.adsVendorAllocation.findMany({
      where: {
        month: getBerlinMonthInfo().month,
      },
      select: {
        customerId: true,
        package: true,
        allocatedBudgetCents: true,
        spentBudgetCents: true,
      },
    }),

    prisma.adsMonthlyPackageBudget.findMany({
      where: {
        month: getBerlinMonthInfo().month,
      },
    }),

    prisma.adsMonthlyPackageBudget.findMany({
      where: {
        month: (() => {
          const [year, month] = getBerlinMonthInfo()
            .month.split("-")
            .map(Number);

          const next = new Date(Date.UTC(year, month, 1));

          return (
            `${next.getUTCFullYear()}-` +
            `${String(next.getUTCMonth() + 1).padStart(2, "0")}`
          );
        })(),
      },
    }),
prisma.adsVendorCampaign.findMany({
  select: {
    customerId: true,
    googleAdsCustomerId: true,
    googleCampaignId: true,
    status: true,
  },
}),
  ]);

const verifiedCustomerIds = new Set(
  verifiedProfiles.map((profile) => profile.customerId)
);

const activeProductCustomerIds = new Set(
  activeProducts.map((product) => product.customerId)
);

const eligibleSubscriptions = subscriptions.filter(
  (subscription) =>
    verifiedCustomerIds.has(subscription.customerId) &&
    activeProductCustomerIds.has(subscription.customerId)
);


  const packages = PACKAGES.map((pkg) => {
const saved = currentMonthlyBudgets.find(
  (budget) =>
    budget.package.toLowerCase() === pkg.name.toLowerCase()
);

    const activeVendors = subscriptions.filter(
      (subscription) =>
        subscription.package?.toLowerCase() ===
        pkg.name.toLowerCase()
    ).length;


const eligibleVendors = eligibleSubscriptions.filter(
  (subscription) =>
    subscription.package?.toLowerCase() ===
    pkg.name.toLowerCase()
).length;


    const monthlyBudgetCents = saved?.monthlyBudgetCents ?? 0;

return {
  name: pkg.name,
  products: pkg.products,
  monthlyBudgetCents,
  activeVendors,
  eligibleVendors,
  totalBudgetCents: activeVendors * monthlyBudgetCents,
  eligibleBudgetCents: eligibleVendors * monthlyBudgetCents,
};  });


  // Gespeicherte Monatszuweisungen zusammenfassen
  const allocatedBudgetCents = monthlyAllocations.reduce(
    (sum, allocation) =>
      sum + allocation.allocatedBudgetCents,
    0
  );

  const spentBudgetCents = monthlyAllocations.reduce(
    (sum, allocation) =>
      sum + allocation.spentBudgetCents,
    0
  );

  const remainingBudgetCents = Math.max(
    0,
    allocatedBudgetCents - spentBudgetCents
  );

  // Anzahl aktuell berechtigter Anbieter mit Monatszuweisung
  const eligibleCustomerIds = new Set(
    eligibleSubscriptions.map(
      (subscription) => subscription.customerId
    )
  );

  const currentlyEligibleAllocations =
    monthlyAllocations.filter((allocation) =>
      eligibleCustomerIds.has(allocation.customerId)
    );

  return {
    packages,
    googleAdsConnected,
    googleAdsAccounts,
    googleAdsAccountDetails,
    googleAdsAccountsError,
    googleAdsManagerAccounts,
    googleAdsManagerAccountsError,
    combinedGoogleAdsAccounts,
    googleAdsCampaigns,
    googleAdsCampaignsError,
    vendorCampaigns,
    budgetMonth: (() => {
      const [year, month] = getBerlinMonthInfo()
        .month.split("-")
        .map(Number);

      const next = new Date(Date.UTC(year, month, 1));

      return new Intl.DateTimeFormat("de-DE", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(next);
    })(),

    nextMonthBudgets: PACKAGES.map((pkg) => {
      const planned = nextMonthlyBudgets.find(
        (budget) =>
          budget.package.toLowerCase() ===
          pkg.name.toLowerCase()
      );

      const current = currentMonthlyBudgets.find(
        (budget) =>
          budget.package.toLowerCase() ===
          pkg.name.toLowerCase()
      );

      return {
        package: pkg.name,
        monthlyBudgetCents:
          planned?.monthlyBudgetCents ??
          current?.monthlyBudgetCents ??
          0,
      };
    }),

    totalVendors: packages.reduce(
      (sum, pkg) => sum + pkg.activeVendors,
      0
    ),
    totalBudgetCents: packages.reduce(
      (sum, pkg) => sum + pkg.totalBudgetCents,
      0
    ),

    allocationSummary: {
      month: getBerlinMonthInfo().month,
      assignedVendors: monthlyAllocations.length,
      currentlyEligibleVendors:
        currentlyEligibleAllocations.length,
      allocatedBudgetCents,
      spentBudgetCents,
      remainingBudgetCents,
    },
  };
};


export const action = async ({ request }) => {
await authenticateAdsAdmin(request);

  const formData = await request.formData();
 
const intent = formData.get("intent");

if (intent === "allocate-monthly-budgets") {
  const now = new Date();
  const { month } = getBerlinMonthInfo(now);

  const [subscriptions, profiles, products] =
    await Promise.all([
      prisma.subscription.findMany({
        where: { status: "active" },
        select: { customerId: true, package: true },
      }),
      prisma.vendorProfile.findMany({
        where: { verificationStatus: "verified" },
        select: { customerId: true },
      }),
      prisma.marketplaceProduct.findMany({
        where: {
          status: "active",
          adminLocked: false,
          shopifyProductId: { not: null },
        },
        select: { customerId: true },
        distinct: ["customerId"],
      }),



    ]);

  const verifiedIds = new Set(
    profiles.map((profile) => profile.customerId)
  );
  const productOwnerIds = new Set(
    products.map((product) => product.customerId)
  );



  // Ausschließlich die gültigen Monatsbudgets verwenden.
  // Bereits gespeicherte Monatswerte bleiben unverändert.
  const monthlyBudgets =
    await ensureMonthlyPackageBudgets(now);

  const budgetByPackage = new Map(
    monthlyBudgets.map((budget) => [
      budget.package.toLowerCase(),
      budget.monthlyBudgetCents,
    ])
  );

  let created = 0;
  let existing = 0;
  let skipped = 0;

  for (const subscription of subscriptions) {
    if (
      !verifiedIds.has(subscription.customerId) ||
      !productOwnerIds.has(subscription.customerId)
    ) {
      skipped++;
      continue;
    }

    const packageName = PACKAGES.find(
      (pkg) =>
        pkg.name.toLowerCase() ===
        subscription.package?.toLowerCase()
    )?.name;

    if (!packageName) {
      skipped++;
      continue;
    }

    const monthlyBudgetCents =
      budgetByPackage.get(packageName.toLowerCase());

    if (
      !Number.isSafeInteger(monthlyBudgetCents) ||
      monthlyBudgetCents < 0
    ) {
      skipped++;
      continue;
    }

    const allocatedBudgetCents =
      calculateProratedBudget(monthlyBudgetCents, now);

    try {
      await prisma.adsVendorAllocation.create({
        data: {
          customerId: subscription.customerId,
          month,
          package: packageName,
          allocatedBudgetCents,
          spentBudgetCents: 0,
        },
      });

      created++;
    } catch (error) {
      if (error.code === "P2002") {
        existing++;
      } else {
        throw error;
      }
    }
  }

  return {
    success: true,
    message:
      `Monat ${month}: ${created} neue Zuweisungen, ` +
      `${existing} bereits vorhanden, ` +
      `${skipped} nicht berücksichtigt.`,
  };
}

if (intent !== null && intent !== "save-budgets") {
  return {
    success: false,
    message: "Unbekannte Aktion.",
  };
}

 const updates = [];

  for (const pkg of PACKAGES) {
    const raw = formData.get(pkg.name);

    if (
      typeof raw !== "string" ||
      !/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim())
    ) {
      return {
        success: false,
        message: `Ungültiges Budget für ${pkg.name}.`,
      };
    }

    const normalized = raw.trim().replace(",", ".");
    const [euros, cents = ""] = normalized.split(".");

    const amount =
      Number(euros) * 100 +
      Number(cents.padEnd(2, "0"));

    if (
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      amount > 2147483647
    ) {
      return {
        success: false,
        message: `Ungültiges Budget für ${pkg.name}.`,
      };
    }

    updates.push({
      package: pkg.name,
      monthlyBudgetCents: amount,
    });
  }


  // Folgemonat anhand der Berliner Zeitzone bestimmen
  const { month: currentMonth } = getBerlinMonthInfo();
  const [year, monthNumber] = currentMonth
    .split("-")
    .map(Number);

  const nextMonthDate = new Date(
    Date.UTC(year, monthNumber, 1)
  );

  const nextMonth =
    `${nextMonthDate.getUTCFullYear()}-` +
    `${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

  // Prüfen, ob der Zielmonat weiterhin in der Zukunft liegt.
  // Maßgeblich ist die Zeitzone Europe/Berlin.
  const monthAtSave = getBerlinMonthInfo().month;

  if (nextMonth <= monthAtSave) {
    return {
      success: false,
      message:
        "Während der Bearbeitung hat ein Monatswechsel " +
        "stattgefunden. Bitte die Seite neu laden und " +
        "die Budgets erneut speichern.",
    };
  }



  // Folgemonat innerhalb einer Transaktion prüfen und speichern.
  try {
    await prisma.$transaction(async (tx) => {
      // Sperre für konkurrierende Budget-Speichervorgänge.
await tx.$queryRaw`
  SELECT pg_advisory_xact_lock(824105, 1)::text
`;

      const databaseTime = await tx.$queryRaw`
        SELECT to_char(
          clock_timestamp() AT TIME ZONE 'Europe/Berlin',
          'YYYY-MM'
        ) AS month
      `;

      const actualMonth = databaseTime[0]?.month;

      if (!actualMonth || nextMonth <= actualMonth) {
        throw new Error("MONAT_WECHSEL");
      }

      for (const item of updates) {
        await tx.adsMonthlyPackageBudget.upsert({
          where: {
            month_package: {
              month: nextMonth,
              package: item.package,
            },
          },
          update: {
            monthlyBudgetCents: item.monthlyBudgetCents,
          },
          create: {
            month: nextMonth,
            package: item.package,
            monthlyBudgetCents: item.monthlyBudgetCents,
          },
        });
      }
    }, {
      maxWait: 10000,
      timeout: 15000,
    });
  } catch (error) {
    if (error.message === "MONAT_WECHSEL") {
      return {
        success: false,
        message:
          "Der Monatswechsel hat stattgefunden. " +
          "Bitte die Seite neu laden und die Budgets erneut speichern.",
      };
    }

    throw error;
  }

  return {
    success: true,
    message:
      `Werbebudgets für ${nextMonth} wurden gespeichert. ` +
      `Die Budgets des laufenden Monats bleiben unverändert.`,
  };

};

export default function AdsManager() {

  const {
    packages,
    budgetMonth,
    nextMonthBudgets,
    totalVendors,
    totalBudgetCents,
    allocationSummary,
    googleAdsConnected,
    googleAdsAccounts,
    googleAdsAccountDetails,
    googleAdsAccountsError,
    googleAdsManagerAccounts,
    googleAdsManagerAccountsError,
    combinedGoogleAdsAccounts,
    googleAdsCampaigns,
    googleAdsCampaignsError,
    vendorCampaigns,
  } = useLoaderData();

  const fetcher = useFetcher();
const googleOAuthFetcher = useFetcher();
const googleOAuthWindowRef = useRef(null);
const googleOAuthHandledDataRef = useRef(null);

useEffect(() => {
  if (googleOAuthFetcher.state !== "idle") {
    return;
  }

const data = googleOAuthFetcher.data;

if (!data || typeof data !== "object") {
  return;
}

if (googleOAuthHandledDataRef.current === data) {
  return;
}

googleOAuthHandledDataRef.current = data;

if (data.success === false) {
  const oauthWindow = googleOAuthWindowRef.current;

  if (oauthWindow && !oauthWindow.closed) {
    try {
      oauthWindow.document.body.textContent =
        typeof data.message === "string"
          ? data.message
          : "Die Google-Ads-Anmeldung konnte nicht gestartet werden.";
    } catch {
      // Browser-Tab ist nicht mehr erreichbar.
    }
  }

  googleOAuthWindowRef.current = null;
  return;
}

  const oauthWindow = googleOAuthWindowRef.current;

  if (!oauthWindow || oauthWindow.closed) {
    return;
  }

  if (
    typeof data.launchUrl !== "string"
  ) {
    oauthWindow.document.body.textContent =
      "Die Google-Ads-Anmeldung konnte nicht gestartet werden.";

    googleOAuthWindowRef.current = null;
    return;
  }

let launchUrl;

try {
  launchUrl = new URL(data.launchUrl);
} catch {
  try {
    oauthWindow.document.body.textContent =
      "Die Google-Ads-Startadresse ist ungültig.";
  } catch {
    // Browser-Tab ist möglicherweise nicht mehr erreichbar.
  }

  googleOAuthWindowRef.current = null;
  return;
}

const launchTokens =
  launchUrl.searchParams.getAll("token");

const validLaunchUrl =
  launchUrl.protocol === "https:" &&
  launchUrl.origin ===
    "https://marktblatt-marketplace.onrender.com" &&
  launchUrl.pathname === "/auth/google/launch" &&
  launchUrl.username === "" &&
  launchUrl.password === "" &&
  launchUrl.hash === "" &&
  [...launchUrl.searchParams.keys()].length === 1 &&
  launchTokens.length === 1 &&
  /^[A-Za-z0-9_-]{43}$/.test(launchTokens[0]);

if (!validLaunchUrl) {
  try {
    oauthWindow.document.body.textContent =
      "Ungültige Google-OAuth-Startadresse.";
  } catch {
    // Browser-Tab ist nicht mehr erreichbar.
  }

  googleOAuthWindowRef.current = null;
  return;
}

  googleOAuthWindowRef.current = null;

try {
  oauthWindow.opener = null;
  oauthWindow.location.replace(launchUrl.toString());
} catch {
  window.alert(
    "Das Google-Ads-Anmeldefenster konnte nicht weitergeleitet werden."
  );
}
}, [googleOAuthFetcher.state, googleOAuthFetcher.data]);

  const [budgets, setBudgets] = useState(() =>
    Object.fromEntries(
      nextMonthBudgets.map((pkg) => [
        pkg.package,
        (pkg.monthlyBudgetCents / 100)
          .toFixed(2)
          .replace(".", ","),
      ])
    )
  );

  useEffect(() => {
    setBudgets(
      Object.fromEntries(
        nextMonthBudgets.map((pkg) => [
          pkg.package,
          (pkg.monthlyBudgetCents / 100)
            .toFixed(2)
            .replace(".", ","),
        ])
      )
    );
  }, [budgetMonth]);

  const saving = fetcher.state !== "idle";

  const formatEuro = (cents) =>
    (cents / 100).toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
    });

const allocateMonthlyBudgets = () => {
  const formData = new FormData();

  formData.set("intent", "allocate-monthly-budgets");

  fetcher.submit(formData, {
    method: "post",
  });
};

  const saveBudgets = () => {
    const formData = new FormData();

    for (const pkg of PACKAGES) {
      formData.set(pkg.name, budgets[pkg.name]);
    }

    fetcher.submit(formData, { method: "post" });
  };

const startGoogleOAuth = () => {
  if (
    googleOAuthFetcher.state !== "idle" ||
    googleOAuthWindowRef.current
  ) {
    return;
  }
  const oauthWindow = window.open(
    "about:blank",
    "_blank"
  );

  if (!oauthWindow) {
    window.alert(
      "Der Browser hat das Anmeldefenster blockiert. Bitte Pop-ups für Marktblatt erlauben."
    );
    return;
  }

googleOAuthWindowRef.current = oauthWindow;

  oauthWindow.document.title = "Google Ads verbinden";

  oauthWindow.document.body.textContent =
    "Die sichere Google-Ads-Anmeldung wird vorbereitet.";

const formData = new FormData();

googleOAuthFetcher.submit(formData, {
  method: "post",
  action: "/auth/google",
});
};

  return (
    <s-page heading="Marktblatt KI Ads Manager">
<s-section heading={`Werbebudgets für ${budgetMonth}`}>
        <s-paragraph>
          Hier legen Sie die Werbebudgets pro Anbieter
          für den kommenden Monat fest.
          Änderungen wirken sich nicht auf den
          laufenden Monat oder bereits zugewiesene
          Werbebudgets aus.
        </s-paragraph>

        <s-paragraph>
          Alle Beträge werden in Euro eingegeben.
          Die tatsächlichen Werbeausgaben werden später
          über die Google Ads API erfasst.
        </s-paragraph>

        <s-table>
          <s-table-header-row>
            <s-table-header>Paket</s-table-header>
            <s-table-header>Produktlimit</s-table-header>
            <s-table-header>
              Budget pro Anbieter (€)
            </s-table-header>
          </s-table-header-row>

          <s-table-body>
            {packages.map((pkg) => (
              <s-table-row key={pkg.name}>
                <s-table-cell>{pkg.name}</s-table-cell>
                <s-table-cell>{pkg.products}</s-table-cell>
                <s-table-cell>
                  <s-text-field
                    label={`Monatsbudget ${pkg.name}`}
                    label-accessibility-visibility="hidden"
                    value={budgets[pkg.name]}
                    onInput={(event) => {
                      const newValue =
                        event.currentTarget.value;

                      setBudgets((previous) => ({
                        ...previous,
                        [pkg.name]: newValue,
                      }));
                    }}
                  />
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>

        <s-box paddingBlockStart="base">
          <s-button
            variant="primary"
            disabled={saving}
            onClick={saveBudgets}
          >
            {saving
              ? "Speichert..."
              : "Budgets speichern"}
          </s-button>
        </s-box>

        {fetcher.data?.message && (
          <s-banner
            tone={
              fetcher.data.success
                ? "success"
                : "critical"
            }
          >
            {fetcher.data.message}
          </s-banner>
        )}
      </s-section>

      <s-section heading="Automatische Budgetübersicht">
        <s-paragraph>
          Die Berechnung basiert auf den aktiven
          Marktblatt-Abonnements und den gespeicherten
          monatlichen Paketbudgets.
        </s-paragraph>

        <s-table>
          <s-table-header-row>
            <s-table-header>Paket</s-table-header>
            <s-table-header>Aktive Anbieter</s-table-header>
            <s-table-header>
              Budget je Anbieter
            </s-table-header>
            <s-table-header>
              Monatsbudget gesamt
            </s-table-header>
          </s-table-header-row>

          <s-table-body>
            {packages.map((pkg) => (
              <s-table-row key={pkg.name}>
                <s-table-cell>{pkg.name}</s-table-cell>
                <s-table-cell>
                  {pkg.activeVendors}
                </s-table-cell>
                <s-table-cell>
                  {formatEuro(pkg.monthlyBudgetCents)}
                </s-table-cell>
                <s-table-cell>
                  {formatEuro(pkg.totalBudgetCents)}
                </s-table-cell>
              </s-table-row>
            ))}

            <s-table-row>
              <s-table-cell>
                <s-text type="strong">Gesamt</s-text>
              </s-table-cell>
              <s-table-cell>
                <s-text type="strong">
                  {totalVendors}
                </s-text>
              </s-table-cell>
              <s-table-cell>–</s-table-cell>
              <s-table-cell>
                <s-text type="strong">
                  {formatEuro(totalBudgetCents)}
                </s-text>
              </s-table-cell>
            </s-table-row>
          </s-table-body>
        </s-table>

        <s-paragraph>
          Die Werte zeigen das geplante Werbebudget,
          nicht die tatsächlichen Google Ads Ausgaben.
        </s-paragraph>
      </s-section>


<s-section heading="Werbeberechtigte Anbieter">
  <s-paragraph>
    Diese Vorschau berücksichtigt aktive Abonnements,
    verifizierte Anbieter und mindestens ein aktives,
    nicht gesperrtes Produkt mit Shopify-Produkt-ID.
  </s-paragraph>

  <s-table>
    <s-table-header-row>
      <s-table-header>Paket</s-table-header>
      <s-table-header>Aktive Anbieter</s-table-header>
      <s-table-header>Werbeberechtigt</s-table-header>
      <s-table-header>Werbebudget</s-table-header>
    </s-table-header-row>

    <s-table-body>
      {packages.map((pkg) => (
        <s-table-row key={pkg.name}>
          <s-table-cell>{pkg.name}</s-table-cell>
          <s-table-cell>{pkg.activeVendors}</s-table-cell>
          <s-table-cell>{pkg.eligibleVendors}</s-table-cell>
          <s-table-cell>
            {formatEuro(pkg.eligibleBudgetCents)}
          </s-table-cell>
        </s-table-row>
      ))}

      <s-table-row>
        <s-table-cell>
          <s-text type="strong">Gesamt</s-text>
        </s-table-cell>
        <s-table-cell>{totalVendors}</s-table-cell>
        <s-table-cell>
          {packages.reduce(
            (sum, pkg) => sum + pkg.eligibleVendors,
            0
          )}
        </s-table-cell>
        <s-table-cell>
          {formatEuro(
            packages.reduce(
              (sum, pkg) => sum + pkg.eligibleBudgetCents,
              0
            )
          )}
        </s-table-cell>
      </s-table-row>
    </s-table-body>
  </s-table>

  <s-paragraph>
    Dies ist eine vorläufige Budgetplanung.
    Die tatsächliche Shopify-Onlineshop-Veröffentlichung
    wird vor der Werbeschaltung zusätzlich geprüft.
    Es werden noch keine Budgets zugewiesen oder
    Google Ads Kampagnen gestartet.
  </s-paragraph>
</s-section>


<s-section heading="Monatliche Budgetzuweisung">
  <s-paragraph>
    Hier können die anteiligen Monatsbudgets für
    alle aktuell werbeberechtigten Anbieter
    einmalig zugewiesen werden.
  </s-paragraph>

  <s-paragraph>
    Bereits gespeicherte Monatsbudgets bleiben
    unverändert. Paket- und Budgetänderungen
    gelten für bestehende Zuweisungen erst
    ab dem nächsten Monat.
  </s-paragraph>

  <s-button
    variant="primary"
    disabled={saving}
    onClick={allocateMonthlyBudgets}
  >
    {saving
      ? "Zuweisung läuft..."
      : "Monatsbudgets zuweisen"}
  </s-button>

  <s-paragraph>
    Die Zuweisung speichert ausschließlich
    interne Budgetwerte. Es werden keine
    Google Ads Kampagnen gestartet.
  </s-paragraph>


  <s-box paddingBlockStart="base">
    <s-heading>Gespeicherte Monatsübersicht</s-heading>
  </s-box>

  <s-table>
    <s-table-header-row>
      <s-table-header>Kennzahl</s-table-header>
      <s-table-header>Wert</s-table-header>
    </s-table-header-row>

    <s-table-body>
      <s-table-row>
        <s-table-cell>Abrechnungsmonat</s-table-cell>
        <s-table-cell>
          {allocationSummary.month}
        </s-table-cell>
      </s-table-row>

      <s-table-row>
        <s-table-cell>Anbieter mit Budget</s-table-cell>
        <s-table-cell>
          {allocationSummary.assignedVendors}
        </s-table-cell>
      </s-table-row>

      <s-table-row>
        <s-table-cell>
          Davon aktuell werbeberechtigt
        </s-table-cell>
        <s-table-cell>
          {allocationSummary.currentlyEligibleVendors}
        </s-table-cell>
      </s-table-row>

      <s-table-row>
        <s-table-cell>Zugewiesenes Budget</s-table-cell>
        <s-table-cell>
          {formatEuro(allocationSummary.allocatedBudgetCents)}
        </s-table-cell>
      </s-table-row>

      <s-table-row>
        <s-table-cell>Bereits verbraucht</s-table-cell>
        <s-table-cell>
          {formatEuro(allocationSummary.spentBudgetCents)}
        </s-table-cell>
      </s-table-row>

      <s-table-row>
        <s-table-cell>
          <s-text type="strong">
            Verbleibendes Budget
          </s-text>
        </s-table-cell>
        <s-table-cell>
          <s-text type="strong">
            {formatEuro(allocationSummary.remainingBudgetCents)}
          </s-text>
        </s-table-cell>
      </s-table-row>
    </s-table-body>
  </s-table>

  <s-paragraph>
    Die Übersicht enthält alle gespeicherten
    Monatszuweisungen, auch von Anbietern, die
    inzwischen nicht mehr werbeberechtigt sind.
    Die tatsächlichen Google Ads Ausgaben werden
    erst nach Anbindung der Google Ads API erfasst.
  </s-paragraph>


</s-section>


<s-section heading="Google Ads Werbekonten">
  {googleAdsConnected ? (
    <>
      {googleAdsAccountsError && (
        <s-banner tone="critical">
          {googleAdsAccountsError}
        </s-banner>
      )}

      {googleAdsManagerAccountsError && (
        <s-banner tone="critical">
          {googleAdsManagerAccountsError}
        </s-banner>
      )}

      <s-paragraph>
        Verfügbare Google Ads Konten:{" "}
        {combinedGoogleAdsAccounts.length}
      </s-paragraph>

      {combinedGoogleAdsAccounts.length > 0 ? (
        <s-table>
          <s-table-header-row>
            <s-table-header>Kontoname</s-table-header>
            <s-table-header>Kundennummer</s-table-header>
            <s-table-header>Kontotyp</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Währung</s-table-header>
            <s-table-header>Verwendung</s-table-header>
          </s-table-header-row>

          <s-table-body>
            {combinedGoogleAdsAccounts.map((account) => (
              <s-table-row key={account.id}>
                <s-table-cell>{account.name}</s-table-cell>
                <s-table-cell>{account.id}</s-table-cell>
                <s-table-cell>
                  {account.isManager
                    ? "Verwaltungskonto (MCC)"
                    : "Werbekonto"}
                </s-table-cell>
                <s-table-cell>{account.status}</s-table-cell>
                <s-table-cell>{account.currency}</s-table-cell>
                <s-table-cell>
                  {account.id === "2908836119"
                    ? "Marktblatt Hauptwerbekonto"
                    : account.isManager
                      ? "Verwaltung"
                      : "Nur Anzeige"}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      ) : (
        <s-paragraph>
          Keine Google Ads Konten gefunden.
        </s-paragraph>
      )}
    </>
  ) : (
    <s-paragraph>
      Bitte zuerst Google Ads verbinden.
    </s-paragraph>
  )}
</s-section>

<s-section heading="Google Ads Kampagnen – Marktblatt.online">
  {googleAdsConnected ? (
    <>
      {googleAdsCampaignsError && (
        <s-banner tone="critical">
          {googleAdsCampaignsError}
        </s-banner>
      )}

      {!googleAdsCampaignsError && (
        <>
          <s-paragraph>
            Gefundene Kampagnen: {googleAdsCampaigns.length}
          </s-paragraph>

          {googleAdsCampaigns.length > 0 ? (
            <s-table>
              <s-table-header-row>
                <s-table-header>Kampagne</s-table-header>
                <s-table-header>Kampagnen-ID</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Typ</s-table-header>
                <s-table-header>Tagesbudget</s-table-header>
                <s-table-header>Ausgaben diesen Monat</s-table-header>
              </s-table-header-row>

              <s-table-body>
                {googleAdsCampaigns.map((campaign) => (
                  <s-table-row key={campaign.id}>
                    <s-table-cell>{campaign.name}</s-table-cell>
                    <s-table-cell>{campaign.id}</s-table-cell>
                    <s-table-cell>
                      {campaign.status === "ENABLED"
                        ? "Aktiv"
                        : campaign.status === "PAUSED"
                          ? "Pausiert"
                          : campaign.status}
                    </s-table-cell>
                    <s-table-cell>{campaign.type}</s-table-cell>
                    <s-table-cell>
                      {campaign.dailyBudgetEuros.toLocaleString(
                        "de-DE",
                        {
                          style: "currency",
                          currency: "EUR",
                        }
                      )}
                    </s-table-cell>
                    <s-table-cell>
                      {campaign.spentThisMonthEuros.toLocaleString(
                        "de-DE",
                        {
                          style: "currency",
                          currency: "EUR",
                        }
                      )}
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          ) : (
            <s-paragraph>
              Keine Kampagnen im Marktblatt-Werbekonto gefunden.
            </s-paragraph>
          )}
        </>
      )}
    </>
  ) : (
    <s-paragraph>
      Bitte zuerst Google Ads verbinden.
    </s-paragraph>
  )}

  <s-paragraph>
    Die Kampagnendaten werden direkt aus Google Ads gelesen.
    Es werden keine Kampagnen erstellt oder verändert.
  </s-paragraph>
</s-section>

<s-section heading="Google Ads Kampagnenzuordnung – Anbieter">
  <s-paragraph>
    Hier sehen Sie die dauerhaft gespeicherten
    Zuordnungen zwischen Marktblatt-Anbietern
    und ihren Google Ads-Kampagnen.
  </s-paragraph>

  <s-paragraph>
    Gespeicherte Zuordnungen: {vendorCampaigns.length}
  </s-paragraph>

  {vendorCampaigns.length > 0 ? (
    <s-table>
      <s-table-header-row>
        <s-table-header>Anbieter-ID</s-table-header>
        <s-table-header>Google Ads Konto</s-table-header>
        <s-table-header>Kampagnen-ID</s-table-header>
        <s-table-header>Status</s-table-header>
      </s-table-header-row>

      <s-table-body>
        {vendorCampaigns.map((vendor) => (
          <s-table-row key={vendor.customerId}>
            <s-table-cell>{vendor.customerId}</s-table-cell>
            <s-table-cell>{vendor.googleAdsCustomerId}</s-table-cell>
            <s-table-cell>
              {vendor.googleCampaignId ?? "Noch nicht zugeordnet"}
            </s-table-cell>
            <s-table-cell>{vendor.status}</s-table-cell>
          </s-table-row>
        ))}
      </s-table-body>
    </s-table>
  ) : (
    <s-paragraph>
      Noch keine Anbieter-Kampagnenzuordnungen vorhanden.
    </s-paragraph>
  )}

  <s-paragraph>
    Diese Übersicht ist schreibgeschützt.
    Es werden keine Google Ads-Kampagnen verändert.
  </s-paragraph>
</s-section>

<s-section heading="Google Ads Verbindung">
  {googleAdsConnected ? (
    <s-paragraph>
      Google Ads verbunden.
    </s-paragraph>
  ) : (
    <>
      <s-paragraph>
        Die Google Ads API ist noch nicht verbunden.
      </s-paragraph>

      <s-button
        variant="primary"
        onClick={startGoogleOAuth}
      >
        Google Ads verbinden
      </s-button>
    </>
  )}

  <s-paragraph>
    Die Verbindung wird ausschließlich durch
    einen berechtigten Marktblatt-Administrator
    eingerichtet.
  </s-paragraph>

  <s-paragraph>
    Nach erfolgreicher Einrichtung können
    Google Ads Konten und Kampagnendaten
    zunächst ausschließlich gelesen werden.
  </s-paragraph>

  <s-paragraph>
    Es werden noch keine Google Ads Kampagnen
    erstellt, verändert oder gestartet.
  </s-paragraph>
</s-section>

    </s-page>
  );
}

        