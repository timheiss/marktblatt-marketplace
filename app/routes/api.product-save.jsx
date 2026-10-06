import db from "../db.server";
import { authenticate } from "../shopify.server";

/*
 * =========================================================
 * URL NORMALISIEREN
 * =========================================================
 */

function normalizeSourceUrl(value) {
  try {
    const url = new URL(String(value).trim());

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    // Hash entfernen, damit z. B.
    // /produkt und /produkt#beschreibung
    // als dasselbe Produkt erkannt werden.
    url.hash = "";

    return url.href;
  } catch {
    return null;
  }
}


/*
 * =========================================================
 * BILDER VORBEREITEN
 * =========================================================
 */

function prepareImages(images) {
  if (!Array.isArray(images)) {
    return null;
  }

  const result = [];
  const seen = new Set();

  for (const image of images) {
    if (!image || typeof image !== "string") {
      continue;
    }

    try {
      const url = new URL(image);

      if (!["http:", "https:"].includes(url.protocol)) {
        continue;
      }

      if (seen.has(url.href)) {
        continue;
      }

      seen.add(url.href);
      result.push(url.href);

      // Maximal 5 Produktbilder übernehmen.
      if (result.length >= 5) {
        break;
      }
    } catch {
      // Ungültige Bild-URL ignorieren.
    }
  }

  if (result.length === 0) {
    return null;
  }

  return JSON.stringify(result);
}


/*
 * =========================================================
 * API ACTION
 * =========================================================
 */

export const action = async ({ request }) => {
  let cors = (response) => response;

  try {
    /*
     * =====================================================
     * SHOPIFY-KUNDEN AUTHENTIFIZIEREN
     * =====================================================
     */

    const authentication =
      await authenticate.public.customerAccount(request);

    cors = authentication.cors;

    const sessionToken =
      authentication.sessionToken;

    const customerId =
      sessionToken?.sub ?? null;

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


    /*
     * =====================================================
     * REQUEST-DATEN LADEN
     * =====================================================
     */

    const body =
      await request.json();

    const product =
      body?.product;


    /*
     * =====================================================
     * PRODUKTDATEN PRÜFEN
     * =====================================================
     */

    if (!product) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Keine Produktdaten übermittelt.",
          },
          {
            status: 400,
          }
        )
      );
    }


    /*
     * TITEL
     */

    const title =
      product.title
        ? String(product.title).trim()
        : "";

    if (!title) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Produkttitel fehlt.",
          },
          {
            status: 400,
          }
        )
      );
    }


    /*
     * ORIGINAL-URL
     */

    const sourceUrl =
      normalizeSourceUrl(
        product.sourceUrl
      );

    if (!sourceUrl) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Die Original-Produkt-URL ist ungültig.",
          },
          {
            status: 400,
          }
        )
      );
    }


    /*
     * =====================================================
     * MARKTBLATT-PAKET DES KUNDEN LADEN
     * =====================================================
     */

    const subscription =
      await db.subscription.findUnique({
        where: {
          customerId,
        },
      });

    if (!subscription) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Für diesen Kunden wurde noch kein Marktblatt-Paket gefunden.",
          },
          {
            status: 403,
          }
        )
      );
    }

    if (subscription.status !== "active") {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Das Marktblatt-Paket dieses Kunden ist nicht aktiv.",
          },
          {
            status: 403,
          }
        )
      );
    }

    const productLimit =
      subscription.productLimit;

    if (
      !Number.isInteger(productLimit) ||
      productLimit < 1
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Für dieses Paket ist kein gültiges Produktlimit hinterlegt.",
          },
          {
            status: 403,
          }
        )
      );
    }


    /*
     * =====================================================
     * BEREITS VERWENDETE PRODUKTE
     * =====================================================
     */

    const usedProducts =
      await db.marketplaceProduct.count({
        where: {
          customerId,

          status: {
            not: "deleted",
          },
        },
      });


    /*
     * =====================================================
     * PRODUKTLIMIT PRÜFEN
     * =====================================================
     */

    if (usedProducts >= productLimit) {
      return cors(
        Response.json(
          {
            success: false,

            error:
              `Ihr Produktlimit von ${productLimit} Produkten ist erreicht.`,

            productLimit,
            usedProducts,
            availableProducts: 0,
          },
          {
            status: 403,
          }
        )
      );
    }


    /*
     * =====================================================
     * DUPLIKAT PRÜFEN
     * =====================================================
     */

    const existingProduct =
      await db.marketplaceProduct.findFirst({
        where: {
          customerId,
          sourceUrl,

          status: {
            not: "deleted",
          },
        },
      });

    if (existingProduct) {
      return cors(
        Response.json(
          {
            success: false,

            error:
              "Dieses Produkt wurde bereits übernommen.",

            existingProductId:
              existingProduct.id,
          },
          {
            status: 409,
          }
        )
      );
    }


    /*
     * =====================================================
     * PRODUKTDATEN VORBEREITEN
     * =====================================================
     */

    const description =
      product.description
        ? String(
            product.description
          ).trim()
        : null;

    const price =
      product.price !== undefined &&
      product.price !== null &&
      product.price !== ""
        ? String(
            product.price
          ).trim()
        : null;

    const currency =
      product.currency
        ? String(
            product.currency
          )
            .trim()
            .toUpperCase()
        : null;

    const vendor =
      product.vendor
        ? String(
            product.vendor
          ).trim()
        : null;

    const brand =
      product.brand
        ? String(
            product.brand
          ).trim()
        : null;

const compareAtPrice =
  product.compareAtPrice !== undefined &&
  product.compareAtPrice !== null &&
  product.compareAtPrice !== ""
    ? String(
        product.compareAtPrice
      ).trim()
    : null;

const compareAtPriceSource =
  product.compareAtPriceSource
    ? String(
        product.compareAtPriceSource
      ).trim()
    : null;


/*
 * =====================================================
 * ZUSÄTZLICHE PRODUKTDATEN
 * =====================================================
 */

const optionalText = (value) =>
  value !== undefined &&
  value !== null &&
  value !== ""
    ? String(value).trim() || null
    : null;

const sku =
  optionalText(product.sku);

const gtin =
  optionalText(product.gtin);

const mpn =
  optionalText(product.mpn);

const category =
  optionalText(product.category);

const productType =
  optionalText(product.productType);

const material =
  optionalText(product.material);

const color =
  optionalText(product.color);

const size =
  optionalText(product.size);


/*
 * SEO / META-DATEN
 */

const metaTitle =
  optionalText(product.metaTitle);

const metaDescription =
  optionalText(product.metaDescription);


/*
 * GOOGLE / MERCHANT PRODUKTDATEN
 */

const condition =
  optionalText(product.condition);

const gender =
  optionalText(product.gender);

const ageGroup =
  optionalText(product.ageGroup);

const adult =
  typeof product.adult === "boolean"
    ? product.adult
    : null;

const itemGroupId =
  optionalText(product.itemGroupId);

/*
 * SHOPIFY PRODUKT-TAXONOMIE
 *
 * Diese Werte wurden zuvor vom Scraper über die
 * Shopify Standard Product Taxonomy ermittelt.
 */

const shopifyTaxonomyId =
  optionalText(
    product.shopifyTaxonomyId
  );

const shopifyTaxonomyName =
  optionalText(
    product.shopifyTaxonomyName
  );

/*
 * =========================================================
 * MARKTBLATT PRODUKT-TAXONOMIE
 * =========================================================
 *
 * Diese Werte wurden zuvor vom Scraper durch die
 * Marktblatt-Klassifizierung ermittelt.
 *
 * Gespeichert werden nur die stabilen IDs und die
 * Confidence. Namen und Tags werden später aus der
 * zentralen Marktblatt-Taxonomie erzeugt.
 */

const marktblattCategoryId =
  optionalText(
    product.marktblattCategoryId
  );

const marktblattSubcategoryId =
  optionalText(
    product.marktblattSubcategoryId
  );

const rawMarktblattCategoryConfidence =
  Number(
    product.marktblattCategoryConfidence
  );

const marktblattCategoryConfidence =
  Number.isFinite(
    rawMarktblattCategoryConfidence
  )
    ? Math.max(
        0,
        Math.min(
          1,
          rawMarktblattCategoryConfidence
        )
      )
    : null;

/*
 * Validierte Shopify-Kategorieattribute.
 *
 * Nur Arrays übernehmen. Falls keine Attribute
 * vorhanden sind, speichern wir null.
 */

const shopifyTaxonomyAttributes =
  Array.isArray(
    product.shopifyTaxonomyAttributes
  ) &&
  product.shopifyTaxonomyAttributes.length
    ? product.shopifyTaxonomyAttributes
    : null;

/*
 * PRODUKTBILDER
 */

const images =
  prepareImages(
    product.images
  );

/*
 * =========================================================
 * AUTOMATISCH ERMITTELTE ANBIETER-LINKS SPEICHERN
 * =========================================================
 *
 * Die Links wurden zuvor beim Prüfen der Produktseite
 * automatisch vom Scraper ermittelt.
 *
 * Vorhandene Rabattinformationen, Firmenbeschreibung
 * und Hintergrundbild werden dadurch nicht verändert.
 */

const vendorLinks =
  product.vendorLinks &&
  typeof product.vendorLinks === "object" &&
  !Array.isArray(product.vendorLinks)
    ? product.vendorLinks
    : null;

if (vendorLinks) {
  const homepageUrl =
    optionalText(
      vendorLinks.homepageUrl
    );

  const imprintUrl =
    optionalText(
      vendorLinks.imprintUrl
    );

  const withdrawalUrl =
    optionalText(
      vendorLinks.withdrawalUrl
    );

  const facebookUrl =
    optionalText(
      vendorLinks.facebookUrl
    );

  const instagramUrl =
    optionalText(
      vendorLinks.instagramUrl
    );

  const tiktokUrl =
    optionalText(
      vendorLinks.tiktokUrl
    );

  const youtubeUrl =
    optionalText(
      vendorLinks.youtubeUrl
    );


  /*
   * Nur tatsächlich gefundene Werte aktualisieren.
   *
   * Dadurch überschreibt ein späterer Scrape,
   * bei dem z. B. kein YouTube-Link gefunden wird,
   * einen bereits gespeicherten YouTube-Link nicht.
   */

  const vendorLinkData = {};

  if (homepageUrl) {
    vendorLinkData.homepageUrl =
      homepageUrl;
  }

  if (imprintUrl) {
    vendorLinkData.imprintUrl =
      imprintUrl;
  }

  if (withdrawalUrl) {
    vendorLinkData.withdrawalUrl =
      withdrawalUrl;
  }

  if (facebookUrl) {
    vendorLinkData.facebookUrl =
      facebookUrl;
  }

  if (instagramUrl) {
    vendorLinkData.instagramUrl =
      instagramUrl;
  }

  if (tiktokUrl) {
    vendorLinkData.tiktokUrl =
      tiktokUrl;
  }

  if (youtubeUrl) {
    vendorLinkData.youtubeUrl =
      youtubeUrl;
  }


  /*
   * Nur speichern, wenn mindestens ein Link
   * gefunden wurde.
   */

  if (
    Object.keys(
      vendorLinkData
    ).length > 0
  ) {
    await db.vendorProfile.upsert({
      where: {
        customerId,
      },

      create: {
        customerId,
        ...vendorLinkData,
      },

      update: {
        ...vendorLinkData,
      },
    });

    console.log(
      "VENDOR LINKS SAVED:",
      {
        customerId,
        ...vendorLinkData,
      }
    );
  }
}

    /*
     * =====================================================
     * PRODUKT SPEICHERN
     * =====================================================
     *
     * Das Produkt wird zunächst als "draft" in unserer
     * Datenbank gespeichert.
     *
     * Die Shopify-IDs werden später beim Veröffentlichen
     * gesetzt.
     */

    const savedProduct =
      await db.marketplaceProduct.create({
        data: {
          customerId,

          /*
           * Die E-Mail-Adresse wird später separat aus den
           * verfügbaren Kundendaten übernommen.
           */
          customerEmail: null,

          title,
          description,

price,
currency,

vendor,
brand,

compareAtPrice,
compareAtPriceSource,

sku,
gtin,
mpn,
category,
productType,
material,
color,
size,

metaTitle,
metaDescription,

condition,
gender,
ageGroup,
adult,
itemGroupId,

shopifyTaxonomyId,
shopifyTaxonomyName,
shopifyTaxonomyAttributes,

marktblattCategoryId,
marktblattSubcategoryId,
marktblattCategoryConfidence,

sourceUrl,
images,

status: "draft",

          shopifyProductId: null,
          shopifyVariantId: null,
          shopifyHandle: null,
        },
      });


    /*
     * =====================================================
     * NEUEN PAKETSTAND BERECHNEN
     * =====================================================
     */

    const newUsedProducts =
      usedProducts + 1;

    const availableProducts =
      Math.max(
        productLimit - newUsedProducts,
        0
      );


    /*
     * =====================================================
     * ERFOLGREICHE ANTWORT
     * =====================================================
     */

    return cors(
      Response.json({
        success: true,

        message:
          "Produkt wurde als Entwurf übernommen.",

        product: {
          id:
            savedProduct.id,

          title:
            savedProduct.title,

          description:
            savedProduct.description,

          price:
            savedProduct.price,

          currency:
            savedProduct.currency,

          vendor:
            savedProduct.vendor,

          brand:
            savedProduct.brand,

          sourceUrl:
            savedProduct.sourceUrl,

          images:
            savedProduct.images
              ? JSON.parse(
                  savedProduct.images
                )
              : [],

          status:
            savedProduct.status,

          shopifyProductId:
            savedProduct.shopifyProductId,

          shopifyVariantId:
            savedProduct.shopifyVariantId,

          shopifyHandle:
            savedProduct.shopifyHandle,

          createdAt:
            savedProduct.createdAt,
        },

        package: {
          package:
            subscription.package,

          productLimit,

          usedProducts:
            newUsedProducts,

          availableProducts,
        },
      })
    );

  } catch (error) {
    console.error(
      "PRODUCT SAVE ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,

          error:
            error instanceof Error
              ? error.message
              : "Produkt konnte nicht gespeichert werden.",
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
 * OPTIONS / GET
 * =========================================================
 *
 * Die Shopify Customer Account Extension läuft auf einer
 * anderen Domain als unsere Render-API.
 *
 * Vor einem POST mit Authorization-Header sendet der
 * Browser deshalb zunächst eine CORS-Preflight-Anfrage
 * mit der Methode OPTIONS.
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

      headers: {
        "Access-Control-Allow-Origin": "*",

        "Access-Control-Allow-Methods":
          "POST, OPTIONS",

        "Access-Control-Allow-Headers":
          "Authorization, Content-Type",
      },
    });
  }


  /*
   * =======================================================
   * GET NICHT ERLAUBT
   * =======================================================
   */

  return Response.json(
    {
      success: false,

      error:
        "Diese Schnittstelle erwartet eine POST-Anfrage.",
    },
    {
      status: 405,

      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
};