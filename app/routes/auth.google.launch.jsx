import { consumeGoogleOAuthLaunchToken } from "../services/google-oauth-attempt.server";
import { createGoogleOAuthCookie } from "../services/google-oauth-cookie.server";
import { createGoogleOAuthUrl } from "../services/google-oauth-url.server";

const ALLOWED_SHOP = "0yr6cb-b4.myshopify.com";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const launchToken = url.searchParams.get("token");

  if (!launchToken) {
    return new Response(
      "Google OAuth: Startnachweis fehlt.",
      {
        status: 400,
        headers: SECURITY_HEADERS,
      }
    );
  }

  const attempt = await consumeGoogleOAuthLaunchToken({
    launchToken,
  });

  if (
    !attempt ||
    attempt.shop !== ALLOWED_SHOP ||
    attempt.userId !== process.env.GOOGLE_ADS_ADMIN_USER_ID
  ) {
    return new Response(
      "Google OAuth: Startnachweis ungültig oder abgelaufen.",
      {
        status: 403,
        headers: SECURITY_HEADERS,
      }
    );
  }

  const googleUrl = createGoogleOAuthUrl(attempt.state);

  return new Response(null, {
    status: 302,
    headers: {
      ...SECURITY_HEADERS,
      "Set-Cookie": createGoogleOAuthCookie(
        attempt.nonce
      ),
      Location: googleUrl,
    },
  });
};