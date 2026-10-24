import { useLoaderData } from "react-router";
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

export default function AdsManager() {
  const { packages } = useLoaderData();

  const formatEuro = (cents) =>
    (cents / 100).toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
    });

  return (
    <s-page heading="Marktblatt KI Ads Manager">
      <s-section heading="Monatliche Werbebudgets">
        <s-paragraph>
          Hier verwalten wir die Werbebudgets je aktivem Anbieter
          entsprechend seinem gebuchten Paket.
        </s-paragraph>

        <s-paragraph>
          Die Budgets werden aus unserer Marktblatt-Datenbank geladen.
        </s-paragraph>

        <s-table>
          <s-table-header-row>
            <s-table-header>Pakete</s-table-header>
            <s-table-header>Produktlimit</s-table-header>
            <s-table-header>Budget pro Anbieter</s-table-header>
          </s-table-header-row>

          <s-table-body>
            {packages.map((pkg) => (
              <s-table-row key={pkg.name}>
                <s-table-cell>{pkg.name}</s-table-cell>
                <s-table-cell>{pkg.products}</s-table-cell>
                <s-table-cell>
                  {formatEuro(pkg.monthlyBudgetCents)}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Google Ads Verbindung">
        <s-paragraph>
          Die Google Ads API ist noch nicht verbunden.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}