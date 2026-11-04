
import prisma from "../db.server";
import { decryptGoogleToken } from "./google-token-crypto.server";
import { refreshGoogleOAuthAccessToken } from "./google-oauth-token.server";

export async function listGoogleAdsAccounts(shop) {
  const connection = await prisma.googleAdsConnection.findUnique({
    where: { shop },
    select: {
      encryptedRefreshToken: true,
      status: true,
    },
  });

  if (
    connection?.status !== "connected" ||
    !connection.encryptedRefreshToken
  ) {
    throw new Error("Google Ads: Keine aktive Verbindung vorhanden.");
  }

  const refreshToken = decryptGoogleToken(
    connection.encryptedRefreshToken
  );

  const accessToken = await refreshGoogleOAuthAccessToken(
    refreshToken
  );

  const response = await fetch(
    "https://googleads.googleapis.com/v22/customers:listAccessibleCustomers",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Google Ads: Kontenabfrage fehlgeschlagen (HTTP ${response.status}).`
    );
  }

  const data = await response.json();

  return data.resourceNames ?? [];
}
