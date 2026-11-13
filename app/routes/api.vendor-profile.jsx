import db from "../db.server";
import countries from "i18n-iso-countries";
import { authenticate, unauthenticated } from "../shopify.server";

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

/*
 * =========================================================
 * SHOPIFY LOGO-BILDER LADEN
 * =========================================================
 */

async function loadVendorLogoImages(profile) {
  const emptyResult = {
    companyLogoWideUrl: null,
    companyLogoSquareUrl: null,
    brandLogos: [],
  };

  if (!profile) {
    return emptyResult;
  }

  const logoIds = [
    profile.companyLogoWideId,
    profile.companyLogoSquareId,
    ...(profile.brandLogoIds || []),
  ].filter(Boolean);

  if (logoIds.length === 0) {
    return emptyResult;
  }

  const shop = process.env.MARKTBLATT_SHOP;

  if (
    !shop ||
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)
  ) {
    throw new Error("MARKTBLATT_SHOP ist nicht korrekt konfiguriert.");
  }

  const { admin } = await unauthenticated.admin(shop);

  const response = await admin.graphql(
    `#graphql
      query VendorLogoImages($ids: [ID!]!) {
        nodes(ids: $ids) {
          id
          ... on MediaImage {
            image {
              url
            }
          }
        }
      }
    `,
    {
      variables: {
        ids: [...new Set(logoIds)],
      },
    }
  );

  const result = await response.json();

  if (result.errors?.length) {
    console.error("VENDOR LOGO GRAPHQL ERROR:", result.errors);
    throw new Error("Logo-Bilder konnten nicht geladen werden.");
  }

  const imageUrls = new Map();

  for (const node of result.data?.nodes || []) {
    if (node?.id && node?.image?.url) {
      imageUrls.set(node.id, node.image.url);
    }
  }

  return {
    companyLogoWideUrl:
      imageUrls.get(profile.companyLogoWideId) || null,

    companyLogoSquareUrl:
      imageUrls.get(profile.companyLogoSquareId) || null,

    brandLogos: (profile.brandLogoIds || []).map((id) => ({
      id,
      url: imageUrls.get(id) || null,
    })),
  };
}

function formatProfile(profile) {
  return {
    companyDescription:
      profile?.companyDescription ?? "",

shippingOrigin:
  profile?.shippingOrigin ?? "",

salesCountries:
  profile?.salesCountries ?? [],

    backgroundImageId:
      profile?.backgroundImageId ?? null,

    companyLogoWideId:
      profile?.companyLogoWideId ?? null,

    companyLogoSquareId:
      profile?.companyLogoSquareId ?? null,

    brandLogoIds:
      profile?.brandLogoIds ?? [],

    discountCode:
      profile?.discountCode ?? "",

    discountPercent:
      profile?.discountPercent ?? null,

    discountMinimumOrderValue:
      profile?.discountMinimumOrderValue ?? "",

deliveryTimeInfo:
  profile?.deliveryTimeInfo ?? "",

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

    const logoImages = await loadVendorLogoImages(profile);

    return cors(
      Response.json({
        success: true,
        profile: {
          ...formatProfile(profile),
          ...logoImages,
        },
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
        800
      );

const EUROPEAN_COUNTRIES = new Set([
  "AL", "AD", "AT", "BY", "BE", "BA", "BG",
  "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IS", "IE", "IT", "XK",
  "LV", "LI", "LT", "LU", "MT", "MD", "MC",
  "ME", "NL", "MK", "NO", "PL", "PT", "RO",
  "RU", "SM", "RS", "SK", "SI", "ES", "SE",
  "CH", "TR", "UA", "GB", "VA", "GE",
  "AM", "AZ"
]);

const CONTINENTS = new Set([
  "EUROPE",
  "ASIA",
  "AFRICA",
  "NORTH_AMERICA",
  "SOUTH_AMERICA",
  "OCEANIA"
]);

const shippingOrigin =
  String(profile.shippingOrigin ?? "")
    .trim()
    .toUpperCase();

const salesCountries =
  profile.salesCountries ?? [];

if (
  shippingOrigin &&
  !countries.isValid(shippingOrigin) &&
  !CONTINENTS.has(shippingOrigin)
) {
  return cors(Response.json({
    success: false,
    error: "Ungültiges Versandland oder Kontinent."
  }, { status: 400 }));
}

if (
  !Array.isArray(salesCountries) ||
  salesCountries.some(
    (country) =>
      typeof country !== "string" ||
      !EUROPEAN_COUNTRIES.has(country)
  )
) {
  return cors(Response.json({
    success: false,
    error: "Ungültige Verkaufsländer ausgewählt."
  }, { status: 400 }));
}

const uniqueSalesCountries = [...new Set(salesCountries)];

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
 * =====================================================
 * LIEFERZEIT
 * =====================================================
 *
 * Diese Angabe gilt für alle Produkte des Anbieters.
 */

const deliveryTimeInfo =
  optionalText(
    profile.deliveryTimeInfo,
    500
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
  shippingOrigin: shippingOrigin || null,
  salesCountries: uniqueSalesCountries,
  discountCode,
  discountPercent,
  discountMinimumOrderValue,
  deliveryTimeInfo,

  homepageUrl,
      imprintUrl,
      withdrawalUrl,

      facebookUrl,
      instagramUrl,
      tiktokUrl,
      youtubeUrl,
    },

update: {
  ...(profile.companyDescription !== undefined
    ? { companyDescription }
    : {}),

  ...(profile.shippingOrigin !== undefined
    ? { shippingOrigin: shippingOrigin || null }
    : {}),

  ...(profile.salesCountries !== undefined
    ? { salesCountries: uniqueSalesCountries }
    : {}),

  ...(profile.discountCode !== undefined
    ? { discountCode }
    : {}),

  ...(profile.discountPercent !== undefined
    ? { discountPercent }
    : {}),

  ...(profile.discountMinimumOrderValue !== undefined
    ? { discountMinimumOrderValue }
    : {}),

  ...(profile.deliveryTimeInfo !== undefined
    ? { deliveryTimeInfo }
    : {}),

...(profile.homepageUrl !== undefined
  ? { homepageUrl }
  : {}),

...(profile.imprintUrl !== undefined
  ? { imprintUrl }
  : {}),

...(profile.withdrawalUrl !== undefined
  ? { withdrawalUrl }
  : {}),

...(profile.facebookUrl !== undefined
  ? { facebookUrl }
  : {}),

...(profile.instagramUrl !== undefined
  ? { instagramUrl }
  : {}),

...(profile.tiktokUrl !== undefined
  ? { tiktokUrl }
  : {}),

...(profile.youtubeUrl !== undefined
  ? { youtubeUrl }
  : {}),
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