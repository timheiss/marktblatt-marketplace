import db from "../db.server";

/*
 * =========================================================
 * ENTWICKLUNGSEINSTELLUNGEN
 * =========================================================
 *
 * Diese beiden Werte sind nur vorübergehend.
 *
 * Später:
 * - customerId kommt aus dem eingeloggten Shopify-Kunden
 * - productLimit kommt aus dessen Subscription
 */

const DEVELOPMENT_CUSTOMER_ID =
  "development-test-customer";

const DEVELOPMENT_PRODUCT_LIMIT = 100;


/*
 * =========================================================
 * URL NORMALISIEREN
 * =========================================================
 */

function normalizeSourceUrl(value) {
  try {
    const url = new URL(
      String(value).trim()
    );

    if (
      !["http:", "https:"].includes(
        url.protocol
      )
    ) {
      return null;
    }

    /*
     * Hash entfernen.
     *
     * Beispiel:
     * /produkt#beschreibung
     *
     * ist dasselbe Produkt wie:
     * /produkt
     */
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
    if (
      !image ||
      typeof image !== "string"
    ) {
      continue;
    }

    try {
      const url = new URL(image);

      if (
        !["http:", "https:"].includes(
          url.protocol
        )
      ) {
        continue;
      }

      if (seen.has(url.href)) {
        continue;
      }

      seen.add(url.href);
      result.push(url.href);

      if (result.length >= 10) {
        break;
      }
    } catch {
      // Ungültiges Bild ignorieren
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

export const action = async ({
  request,
}) => {
  try {
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
      return Response.json(
        {
          success: false,
          error:
            "Keine Produktdaten übermittelt.",
        },
        {
          status: 400,
        }
      );
    }


    /*
     * TITEL
     */

    const title =
      product.title
        ? String(
            product.title
          ).trim()
        : "";

    if (!title) {
      return Response.json(
        {
          success: false,
          error:
            "Produkttitel fehlt.",
        },
        {
          status: 400,
        }
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
      return Response.json(
        {
          success: false,
          error:
            "Die Original-Produkt-URL ist ungültig.",
        },
        {
          status: 400,
        }
      );
    }


    /*
     * =====================================================
     * KUNDE
     * =====================================================
     *
     * VORÜBERGEHEND:
     *
     * Später ersetzen wir dies durch die
     * echte Shopify Customer ID.
     */

    const customerId =
      DEVELOPMENT_CUSTOMER_ID;

    const customerEmail =
      null;


    /*
     * =====================================================
     * PAKETLIMIT
     * =====================================================
     *
     * VORÜBERGEHEND:
     *
     * Später kommt dieser Wert aus:
     *
     * db.subscription
     */

    const productLimit =
      DEVELOPMENT_PRODUCT_LIMIT;


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

    if (
      usedProducts >=
      productLimit
    ) {
      return Response.json(
        {
          success: false,

          error:
            `Ihr Produktlimit von ${productLimit} Produkten ist erreicht.`,
        },
        {
          status: 403,
        }
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
      return Response.json(
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
      product.price !==
        undefined &&
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
     * PRODUKT IN MARKTBLATT-DATENBANK SPEICHERN
     * =====================================================
     *
     * shopifyProductId
     * shopifyVariantId
     * shopifyHandle
     *
     * bleiben zunächst NULL.
     *
     * Sie werden gesetzt, sobald das Produkt
     * tatsächlich in Shopify erzeugt wurde.
     */

    const savedProduct =
      await db.marketplaceProduct.create({
        data: {
          customerId,
          customerEmail,

          title,
          description,

          price,
          currency,

          vendor,
          brand,

          sourceUrl,
          images,

          /*
           * Produkt wurde übernommen,
           * aber noch nicht in Shopify
           * veröffentlicht.
           */
          status: "draft",

          shopifyProductId:
            null,

          shopifyVariantId:
            null,

          shopifyHandle:
            null,
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
        productLimit -
          newUsedProducts,
        0
      );


    /*
     * =====================================================
     * ERFOLGREICHE ANTWORT
     * =====================================================
     */

    return Response.json({
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
        productLimit,
        usedProducts:
          newUsedProducts,
        availableProducts,
      },
    });

  } catch (error) {
    console.error(
      "PRODUCT SAVE ERROR:",
      error
    );

    return Response.json(
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
    );
  }
};


/*
 * =========================================================
 * GET-AUFRUF
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
