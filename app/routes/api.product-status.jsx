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
 * STATUS ÄNDERN
 * =========================================================
 */

export const action = async ({ request }) => {
  try {
    const body = await request.json();

    const productId =
      body?.productId;

    const requestedStatus =
      body?.status;


    /*
     * Produkt-ID prüfen
     */

    if (!productId) {
      return Response.json(
        {
          success: false,
          error:
            "Produkt-ID fehlt.",
        },
        {
          status: 400,
        }
      );
    }


    /*
     * Nur diese beiden Statuswerte
     * dürfen über diesen Endpunkt gesetzt werden.
     */

    if (
      requestedStatus !== "active" &&
      requestedStatus !== "inactive"
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Ungültiger Produktstatus.",
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
     * customerId wird mit geprüft, damit später ein
     * Anbieter keine fremden Produkte verändern kann.
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
          error:
            "Produkt wurde nicht gefunden.",
        },
        {
          status: 404,
        }
      );
    }


    /*
     * =====================================================
     * STATUS SPEICHERN
     * =====================================================
     */

    const updatedProduct =
      await db.marketplaceProduct.update({
        where: {
          id: existingProduct.id,
        },

        data: {
          status:
            requestedStatus,
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
        requestedStatus === "active"
          ? "Produkt wurde aktiviert."
          : "Produkt wurde deaktiviert.",

      product: {
        id:
          updatedProduct.id,

        status:
          updatedProduct.status,

        shopifyProductId:
          updatedProduct.shopifyProductId,

        updatedAt:
          updatedProduct.updatedAt,
      },
    });

  } catch (error) {
    console.error(
      "PRODUCT STATUS ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Produktstatus konnte nicht geändert werden.",
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
