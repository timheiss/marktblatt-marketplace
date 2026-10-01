import db from "../db.server";
import { authenticate } from "../shopify.server";

/*
 * =========================================================
 * CORS
 * =========================================================
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/*
 * =========================================================
 * ANBIETERPROFIL
 * =========================================================
 *
 * GET:
 * Anbieterprofil des eingeloggten Kunden laden.
 *
 * POST:
 * Vom Anbieter gepflegte Informationen speichern.
 *
 * Das Profil ist kundenbezogen und gilt später für
 * alle Produkte dieses Anbieters.
 */


/*
 * =========================================================
 * KUNDEN-ID ERMITTELN
 * =========================================================
 */

async function authenticateCustomer(request) {
  const authentication =
    await authenticate.public.customerAccount(request);

  return {
    cors: authentication.cors,
    customerId:
      authentication.sessionToken?.sub ?? null,
  };
}


/*
 * =========================================================
 * TEXT NORMALISIEREN
 * =========================================================
 */

function optionalText(value, maxLength) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  return text.slice(0, maxLength);
}


/*
 * =========================================================
 * PROFIL FÜR FRONTEND VORBEREITEN
 * =========================================================
 */

function formatProfile(profile) {
  return {
    companyDescription:
      profile?.companyDescription ?? "",

    backgroundImageId:
      profile?.backgroundImageId ?? null,

    discountCode:
      profile?.discountCode ?? "",

    discountPercent:
      profile?.discountPercent ?? null,

    discountMinimumOrderValue:
      profile?.discountMinimumOrderValue ?? "",

    homepageUrl:
      profile?.homepageUrl ?? "",

    imprintUrl:
      profile?.imprintUrl ?? "",

    withdrawalUrl:
      profile?.withdrawalUrl ?? "",

    facebookUrl:
      profile?.facebookUrl ?? "",

    instagramUrl:
      profile?.instagramUrl ?? "",

    tiktokUrl:
      profile?.tiktokUrl ?? "",

    youtubeUrl:
      profile?.youtubeUrl ?? "",
  };
}


/*
 * =========================================================
 * GET – ANBIETERPROFIL LADEN
 * =========================================================
 */

export const loader = async ({ request }) => {

  /*
   * =======================================================
   * CORS PREFLIGHT
   * =======================================================
   */

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  let cors = (response) => response;

  try {
    const authentication =
      await authenticateCustomer(request);

    cors = authentication.cors;

    const customerId =
      authentication.customerId;

    if (!customerId) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Kunden-ID konnte nicht ermittelt werden.",
          },
          {
            status: 401,
          }
        )
      );
    }

    const profile =
      await db.vendorProfile.findUnique({
        where: {
          customerId,
        },
      });

    return cors(
      Response.json({
        success: true,
        profile:
          formatProfile(profile),
      })
    );
  } catch (error) {
    console.error(
      "VENDOR PROFILE LOAD ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,
          error:
            "Anbieterinformationen konnten nicht geladen werden.",
        },
        {
          status: 500,
        }
      )
    );
  }
};


/*
 * =========================================================
 * POST – ANBIETERPROFIL SPEICHERN
 * =========================================================
 */

export const action = async ({ request }) => {

  /*
   * =======================================================
   * CORS PREFLIGHT
   * =======================================================
   */

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  let cors = (response) => response;

  try {
    const authentication =
      await authenticateCustomer(request);

    cors = authentication.cors;

    const customerId =
      authentication.customerId;

    if (!customerId) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Kunden-ID konnte nicht ermittelt werden.",
          },
          {
            status: 401,
          }
        )
      );
    }

    if (request.method !== "POST") {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Methode nicht unterstützt.",
          },
          {
            status: 405,
          }
        )
      );
    }

    const body =
      await request.json();

    const profile =
      body?.profile;

    if (
      !profile ||
      typeof profile !== "object" ||
      Array.isArray(profile)
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Keine gültigen Anbieterinformationen übermittelt.",
          },
          {
            status: 400,
          }
        )
      );
    }


    /*
     * =====================================================
     * FIRMENBESCHREIBUNG
     * =====================================================
     */

    const companyDescription =
      optionalText(
        profile.companyDescription,
        5000
      );


    /*
     * =====================================================
     * RABATTCODE
     * =====================================================
     */

    const discountCode =
      optionalText(
        profile.discountCode,
        100
      );


    /*
     * =====================================================
     * RABATT IN PROZENT
     * =====================================================
     */

    let discountPercent = null;

    if (
      profile.discountPercent !== undefined &&
      profile.discountPercent !== null &&
      String(profile.discountPercent).trim() !== ""
    ) {
      const parsed =
        Number(profile.discountPercent);

      if (
        !Number.isInteger(parsed) ||
        parsed < 1 ||
        parsed > 100
      ) {
        return cors(
          Response.json(
            {
              success: false,
              error:
                "Der Rabatt muss als ganze Zahl zwischen 1 und 100 % angegeben werden.",
            },
            {
              status: 400,
            }
          )
        );
      }

      discountPercent = parsed;
    }


    /*
     * =====================================================
     * MINDESTBESTELLWERT
     * =====================================================
     */

    const discountMinimumOrderValue =
      optionalText(
        profile.discountMinimumOrderValue,
        100
      );

/*
 * =========================================================
 * LINKS / SOCIAL MEDIA
 * =========================================================
 */

const homepageUrl =
  optionalText(
    profile.homepageUrl,
    2000
  );

const imprintUrl =
  optionalText(
    profile.imprintUrl,
    2000
  );

const withdrawalUrl =
  optionalText(
    profile.withdrawalUrl,
    2000
  );

const facebookUrl =
  optionalText(
    profile.facebookUrl,
    2000
  );

const instagramUrl =
  optionalText(
    profile.instagramUrl,
    2000
  );

const tiktokUrl =
  optionalText(
    profile.tiktokUrl,
    2000
  );

const youtubeUrl =
  optionalText(
    profile.youtubeUrl,
    2000
  );

    /*
     * =====================================================
     * RABATTANGABEN AUF VOLLSTÄNDIGKEIT PRÜFEN
     * =====================================================
     *
     * Sobald ein Rabattcode eingetragen wird, verlangen
     * wir auch die prozentuale Rabatthöhe.
     */

    if (
      discountCode &&
      discountPercent === null
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Bitte geben Sie für den Rabattcode auch die Rabatthöhe in % an.",
          },
          {
            status: 400,
          }
        )
      );
    }


    /*
     * =====================================================
     * PROFIL ANLEGEN ODER AKTUALISIEREN
     * =====================================================
     */

const savedProfile =
  await db.vendorProfile.upsert({
    where: {
      customerId,
    },

    create: {
      customerId,
      companyDescription,
      discountCode,
      discountPercent,
      discountMinimumOrderValue,

      homepageUrl,
      imprintUrl,
      withdrawalUrl,

      facebookUrl,
      instagramUrl,
      tiktokUrl,
      youtubeUrl,
    },

    update: {
      companyDescription,
      discountCode,
      discountPercent,
      discountMinimumOrderValue,

      homepageUrl,
      imprintUrl,
      withdrawalUrl,

      facebookUrl,
      instagramUrl,
      tiktokUrl,
      youtubeUrl,
    },
  });


    return cors(
      Response.json({
        success: true,
        profile:
          formatProfile(savedProfile),
      })
    );
  } catch (error) {
    console.error(
      "VENDOR PROFILE SAVE ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,
          error:
            "Anbieterinformationen konnten nicht gespeichert werden.",
        },
        {
          status: 500,
        }
      )
    );
  }
};