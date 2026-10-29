

import { useEffect, useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ensureMonthlyPackageBudgets } from "../services/ads-monthly-budget.server";

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
  await authenticate.admin(request);

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
] =
  await Promise.all([
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
  await authenticate.admin(request);

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
  } = useLoaderData();

  const fetcher = useFetcher();

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


      <s-section heading="Google Ads Verbindung">
        <s-paragraph>
          Die Google Ads API ist noch nicht verbunden.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

        