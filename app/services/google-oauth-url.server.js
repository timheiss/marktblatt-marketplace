
export function createGoogleOAuthUrl(state) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error(
      "Google OAuth: Client-ID oder Redirect-URI fehlt."
    );
  }

  const expectedRedirectUri =
    "https://marktblatt-marketplace.onrender.com/auth/google/callback";

  if (redirectUri !== expectedRedirectUri) {
    throw new Error(
      "Google OAuth: Nicht erlaubte Redirect-URI."
    );
  }

  const url = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth"
  );

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/adwords"
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  return url.toString();
}
