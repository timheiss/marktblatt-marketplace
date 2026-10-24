import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function AdsManager() {
  return (
    <s-page heading="Marktblatt KI Ads Manager">
      <s-section heading="Google Ads Verwaltung">
        <s-paragraph>
          Willkommen im Marktblatt KI Ads Manager.
        </s-paragraph>

        <s-paragraph>
          Hier verwalten wir zukünftig die Google Ads Kampagnen,
          Werbebudgets und KI-Optimierungen.
        </s-paragraph>
      </s-section>

      <s-section heading="Geplante Funktionen">
        <s-unordered-list>
          <s-list-item>
            Google Ads API Verbindung
          </s-list-item>

          <s-list-item>
            Automatische Werbebudgets nach Anbieterpaket
          </s-list-item>

          <s-list-item>
            Faire Werbeverteilung auf alle Anbieter
          </s-list-item>

          <s-list-item>
            KI-gestützte Suchbegriffsoptimierung
          </s-list-item>

          <s-list-item>
            Werbestatistiken für Anbieter
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}