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

      // Maximal 10 Produktbilder übernehmen.
      if (result.length >= 10) {
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

    const images =
      prepareImages(
        product.images
      );


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
          "Produkt wurde erfolgreich in Marktblatt übernommen.",

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
 * GET NICHT ERLAUBT
 * =========================================================
 */

export const loader = async () => {
  return Response.json(
    {
      success: false,

      error:
        "Diese Schnittstelle erwartet eine POST-Anfrage.",
    },
    {
      status: 405,
    }
  );
};