
import { verifyGoogleOAuthState } from "../services/google-oauth-state.server";
import { consumeGoogleOAuthAttempt } from "../services/google-oauth-attempt.server";
import {
  verifyGoogleOAuthCookie,
  clearGoogleOAuthCookie,
} from "../services/google-oauth-cookie.server";
import { exchangeGoogleOAuthCode } from "../services/google-oauth-token.server";
import { saveGoogleAdsConnection } from "../services/google-ads-connection.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  const error = url.searchParams.get("error");


  if (error) {
    return new Response(
      "Google OAuth: Anmeldung wurde abgebrochen oder abgelehnt.",
      {
        status: 400,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "Set-Cookie": clearGoogleOAuthCookie(),
        },
      }
    );
  }


  const state = url.searchParams.get("state");

  const payload = verifyGoogleOAuthState(state);

  if (!payload) {
    return new Response(
      "Google OAuth: Ungültiger oder abgelaufener Anmeldevorgang.",
      {
        status: 403,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }


  const allowedUserId =
    process.env.GOOGLE_ADS_ADMIN_USER_ID;

  const allowedShop = "0yr6cb-b4.myshopify.com";

  if (
    !allowedUserId ||
    payload.userId !== allowedUserId
  ) {
    return new Response(
      "Google OAuth: Keine Administratorberechtigung.",
      { status: 403 }
    );
  }


  if (!verifyGoogleOAuthCookie(request, payload.nonce)) {
    return new Response(
      "Google OAuth: Browserprüfung fehlgeschlagen.",
      {
        status: 403,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const code = url.searchParams.get("code");

  if (
    !code ||
    code.length > 4096 ||
    !/^[A-Za-z0-9/_-]+$/.test(code)
  ) {
    return new Response(
      "Google OAuth: Autorisierungscode fehlt oder ist ungültig.",
      {
        status: 400,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
"Set-Cookie": clearGoogleOAuthCookie(),
        },
      }
    );
  }


  const validAttempt = await consumeGoogleOAuthAttempt({
    nonce: payload.nonce,
    userId: payload.userId,
    shop: allowedShop,
  });

  if (!validAttempt) {
    return new Response(
      "Google OAuth: Anmeldevorgang unbekannt, abgelaufen oder bereits verwendet.",
      { status: 403 }
    );
  }


  try {
    const tokens = await exchangeGoogleOAuthCode(code);

    if (
      typeof tokens.refresh_token !== "string" ||
      !tokens.refresh_token
    ) {
      return new Response(
        "Google OAuth: Kein Refresh-Token erhalten. Verbindung nicht gespeichert.",
        {
          status: 502,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
"Set-Cookie": clearGoogleOAuthCookie(),
          },
        }
      );
    }

    await saveGoogleAdsConnection({
      shop: allowedShop,
      userId: payload.userId,
      refreshToken: tokens.refresh_token,
    });


return new Response(
  "Google Ads: Verbindung erfolgreich gespeichert.",
  {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": clearGoogleOAuthCookie(),
    },
  }
);

  } catch {
    return new Response(
      "Google OAuth: Verbindung konnte nicht abgeschlossen werden.",
      {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
"Set-Cookie": clearGoogleOAuthCookie(),
        },
      }
    );
  }

};
