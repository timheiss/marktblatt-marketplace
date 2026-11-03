
const GOOGLE_TOKEN_ENDPOINT =
  "https://oauth2.googleapis.com/token";

export async function exchangeGoogleOAuthCode(code) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_ADS_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_ADS_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth: Serverkonfiguration unvollständig."
    );
  }

  if (typeof code !== "string" || !code) {
    throw new Error(
      "Google OAuth: Autorisierungscode fehlt."
    );
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type":
        "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      `Google OAuth: Token-Austausch fehlgeschlagen (HTTP ${response.status}).`
    );
  }

  const tokens = await response.json();

  if (
    typeof tokens.access_token !== "string" ||
    !tokens.access_token
  ) {
    throw new Error(
      "Google OAuth: Kein gültiges Access-Token erhalten."
    );
  }

  return tokens;
}
