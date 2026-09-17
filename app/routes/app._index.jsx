import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const testPackageApi = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/package");

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "Die Paket-API konnte nicht geladen werden."
        );
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <s-page heading="Marktblatt Marketplace">
      <s-section heading="Paket-System testen">
        <s-stack direction="block" gap="base">

          <s-paragraph>
            Hier prüfen wir, welche Marktblatt-Pakete in Shopify gefunden werden.
          </s-paragraph>

          <s-button
            variant="primary"
            onClick={testPackageApi}
            {...(loading ? { loading: true } : {})}
          >
            Paket-API testen
          </s-button>

          {error && (
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-text>
                Fehler: {error}
              </s-text>
            </s-box>
          )}

          {result && (
            <s-section heading="API-Ergebnis">
              <s-stack direction="block" gap="base">

                <s-text>
                  Gefundene Pakete: {result.subscriptionsFound ?? 0}
                </s-text>

                <s-box
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </s-box>

              </s-stack>
            </s-section>
          )}

        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};