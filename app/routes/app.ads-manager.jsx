
import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PACKAGES = [
  { name: "Starter", products: 10 },
  { name: "Business", products: 100 },
  { name: "Professional", products: 250 },
  { name: "Enterprise", products: 600 },
];

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  const budgets = await prisma.adsPackageBudget.findMany();

  return {
    packages: PACKAGES.map((pkg) => {
      const saved = budgets.find(
        (budget) =>
          budget.package.toLowerCase() === pkg.name.toLowerCase()
      );

      return {
        name: pkg.name,
        products: pkg.products,
        monthlyBudgetCents: saved?.monthlyBudgetCents ?? 0,
      };
    }),
  };
};

export const action = async ({ request }) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const updates = [];

  for (const pkg of PACKAGES) {
    const raw = formData.get(pkg.name);

    if (typeof raw !== "string" ||
        !/^\d+(?:[.,]\d{1,2})?$/.test(raw.trim())) {
      return {
        success: false,
        message: `Ungültiges Budget für ${pkg.name}.`,
      };
    }

    const normalized = raw.trim().replace(",", ".");
    const [euros, cents = ""] = normalized.split(".");
    const amount = Number(euros) * 100 +
      Number(cents.padEnd(2, "0"));

    if (!Number.isSafeInteger(amount) || amount < 0) {
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

  await prisma.$transaction(
    updates.map((item) =>
      prisma.adsPackageBudget.upsert({
        where: { package: item.package },
        update: {
          monthlyBudgetCents: item.monthlyBudgetCents,
        },
        create: item,
      })
    )
  );

  return {
    success: true,
    message: "Werbebudgets wurden erfolgreich gespeichert.",
  };
};

export default function AdsManager() {
  const { packages } = useLoaderData();
  const fetcher = useFetcher();

  const [budgets, setBudgets] = useState(() =>
    Object.fromEntries(
      packages.map((pkg) => [
        pkg.name,
        (pkg.monthlyBudgetCents / 100)
          .toFixed(2)
          .replace(".", ","),
      ])
    )
  );

  const saving = fetcher.state !== "idle";

  const saveBudgets = () => {
    const formData = new FormData();

    for (const pkg of PACKAGES) {
      formData.set(pkg.name, budgets[pkg.name]);
    }

    fetcher.submit(formData, { method: "post" });
  };

  return (
    <s-page heading="Marktblatt KI Ads Manager">
      <s-section heading="Monatliche Werbebudgets">
        <s-paragraph>
          Hier verwalten wir die monatlichen Werbebudgets
          pro aktivem Anbieter entsprechend seinem Paket.
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
            <s-table-header>Budget pro Anbieter (€)</s-table-header>
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
  const newValue = event.currentTarget.value;

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
            {saving ? "Speichert..." : "Budgets speichern"}
          </s-button>
        </s-box>

        {fetcher.data?.message && (
          <s-banner
            tone={fetcher.data.success ? "success" : "critical"}
          >
            {fetcher.data.message}
          </s-banner>
        )}
      </s-section>

      <s-section heading="Google Ads Verbindung">
        <s-paragraph>
          Die Google Ads API ist noch nicht verbunden.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

        