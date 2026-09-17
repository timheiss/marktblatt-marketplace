import db from "../db.server";

/*
 * =========================================================
 * ENTWICKLUNG
 * =========================================================
 *
 * Später wird diese ID durch die echte Shopify Customer ID
 * des eingeloggten Kunden ersetzt.
 */

const DEVELOPMENT_CUSTOMER_ID =
  "development-test-customer";


/*
 * =========================================================
 * PRODUKT LÖSCHEN
 * =========================================================
 */

export const action = async ({ request }) => {
  try {
    const body = await request.json();

    const productId =
      body?.productId;


    /*
     * Produkt-ID prüfen
     */

    if (!productId) {
      return Response.json(
        {
          success: false,
          error: "Produkt-ID fehlt.",
        },
        {
          status: 400,
        }
      );
    }


    /*
     * =====================================================
     * PRODUKT SUCHEN
     * =====================================================
     *
     * Wir prüfen zusätzlich customerId.
     * Dadurch kann ein Anbieter später nur seine
     * eigenen Produkte löschen.
     */

    const existingProduct =
      await db.marketplaceProduct.findFirst({
        where: {
          id: productId,

          customerId:
            DEVELOPMENT_CUSTOMER_ID,

          status: {
            not: "deleted",
          },
        },
      });


    if (!existingProduct) {
      return Response.json(
        {
          success: false,
          error: "Produkt wurde nicht gefunden.",
        },
        {
          status: 404,
        }
      );
    }


    /*
     * =====================================================
     * SOFT DELETE
     * =====================================================
     *
     * Der Datensatz bleibt in der Datenbank erhalten.
     * Er wird nur als gelöscht markiert.
     */

    const deletedProduct =
      await db.marketplaceProduct.update({
        where: {
          id: existingProduct.id,
        },

        data: {
          status: "deleted",
        },
      });


    /*
     * =====================================================
     * ERFOLG
     * =====================================================
     */

    return Response.json({
      success: true,

      message:
        "Produkt wurde erfolgreich gelöscht.",

      product: {
        id:
          deletedProduct.id,

        status:
          deletedProduct.status,

        shopifyProductId:
          deletedProduct.shopifyProductId,

        shopifyVariantId:
          deletedProduct.shopifyVariantId,

        updatedAt:
          deletedProduct.updatedAt,
      },
    });

  } catch (error) {
    console.error(
      "PRODUCT DELETE ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Produkt konnte nicht gelöscht werden.",
      },
      {
        status: 500,
      }
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
