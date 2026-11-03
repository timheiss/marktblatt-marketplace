import { authenticateAdsAdmin } from "../services/ads-admin-auth.server";
import { createGoogleOAuthAttemptData } from "../services/google-oauth-state.server";
import {
  saveGoogleOAuthAttempt,
  createGoogleOAuthLaunchToken,
} from "../services/google-oauth-attempt.server";

const APP_ORIGIN = "https://marktblatt-marketplace.onrender.com";

export const loader = async ({ request }) => {
  await authenticateAdsAdmin(request);

  return new Response(
    "Google Ads OAuth: Anmeldung bereit. Start nur über POST.",
    {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );
};

export const action = async ({ request }) => {
if (request.method !== "POST") {
  return Response.json(
    {
      success: false,
      message: "Methode nicht erlaubt.",
    },
    {
      status: 405,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

  const origin = request.headers.get("Origin");

if (origin !== APP_ORIGIN) {
  return Response.json(
    {
      success: false,
      message: "Google OAuth: Anfrageherkunft nicht erlaubt.",
    },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

  const { session } = await authenticateAdsAdmin(request);

  const userId = process.env.GOOGLE_ADS_ADMIN_USER_ID;

if (!userId) {
  return Response.json(
    {
      success: false,
      message:
        "Google Ads: Administrator nicht konfiguriert.",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

try {
  const attempt = createGoogleOAuthAttemptData(userId);

  await saveGoogleOAuthAttempt({
    state: attempt.state,
    nonce: attempt.nonce,
    userId: attempt.userId,
    shop: session.shop,
    expiresAt: attempt.expiresAt,
  });

  const launchToken = await createGoogleOAuthLaunchToken({
    nonce: attempt.nonce,
    userId: attempt.userId,
    shop: session.shop,
  });

  const launchUrl = new URL(
    "/auth/google/launch",
    APP_ORIGIN
  );

  launchUrl.searchParams.set("token", launchToken);

  return Response.json(
    {
      success: true,
      launchUrl: launchUrl.toString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
} catch (error) {
  console.error(
    "Google OAuth: Start fehlgeschlagen:",
    error instanceof Error ? error.name : "Unbekannter Fehler"
  );

  return Response.json(
    {
      success: false,
      message:
        "Die Google-Ads-Anmeldung konnte nicht vorbereitet werden. Bitte erneut versuchen.",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}
};
