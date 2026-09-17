import db from "../db.server";

/*
 * =========================================================
 * ENTWICKLUNGSEINSTELLUNGEN
 * =========================================================
 *
 * Später wird diese ID durch die echte
 * Shopify Customer ID ersetzt.
 */

const DEVELOPMENT_CUSTOMER_ID =
  "development-test-customer";


/*
 * =========================================================
 * BILDER AUS DATENBANK LESEN
 * =========================================================
 */

function parseImages(value) {
  if (!value) {
    return [];
  }

  try {
    const images = JSON.parse(value);

    return Array.isArray(images)
      ? images
      : [];
  } catch {
    return [];
  }
}


/*
 * =========================================================
 * PRODUKTLISTE LADEN
 * =========================================================
 */

export const loader = async () => {
  try {
    const customerId =
      DEVELOPMENT_CUSTOMER_ID;

    /*
     * Alle Produkte dieses Anbieters laden.
     *
     * Gelöschte Produkte werden nicht angezeigt.
     */

    const products =
      await db.marketplaceProduct.findMany({
        where: {
          customerId,

          status: {
            not: "deleted",
          },
        },

        orderBy: {
          createdAt: "desc",
        },
      });


    /*
     * Daten für die Customer-Account-Extension
     * vorbereiten.
     */

    const formattedProducts =
      products.map((product) => ({
        id:
          product.id,

        title:
          product.title,

        description:
          product.description,

        price:
          product.price,

        currency:
          product.currency,

        vendor:
          product.vendor,

        brand:
          product.brand,

        sourceUrl:
          product.sourceUrl,

        images:
          parseImages(
            product.images
          ),

        /*
         * Erstes Bild zusätzlich direkt
         * bereitstellen.
         */

        image:
          parseImages(
            product.images
          )[0] || null,

        status:
          product.status,

        shopifyProductId:
          product.shopifyProductId,

        shopifyVariantId:
          product.shopifyVariantId,

        shopifyHandle:
          product.shopifyHandle,

        createdAt:
          product.createdAt,

        updatedAt:
          product.updatedAt,
      }));


    /*
     * Paketbelegung berechnen.
     *
     * Noch vorübergehend Business = 100.
     */

    const productLimit = 100;

    const usedProducts =
      formattedProducts.length;

    const availableProducts =
      Math.max(
        productLimit -
          usedProducts,
        0
      );


    return Response.json({
      success: true,

      products:
        formattedProducts,

      productCount:
        formattedProducts.length,

      package: {
        name:
          "Business",

        productLimit,

        usedProducts,

        availableProducts,
      },
    });

  } catch (error) {
    console.error(
      "PRODUCT LIST ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Produkte konnten nicht geladen werden.",
      },
      {
        status: 500,
      }
    );
  }
};
