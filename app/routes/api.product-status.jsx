import db from "../db.server";
import { authenticate } from "../shopify.server";

/*
 * =========================================================
 * PRODUKTSTATUS ÄNDERN
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

    const productId =
      body?.productId;

    const requestedStatus =
      body?.status;


    /*
     * =====================================================
     * PRODUKT-ID PRÜFEN
     * =====================================================
     */

    if (!productId) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Produkt-ID fehlt.",
          },
          {
            status: 400,
          }
        )
      );
    }


    /*
     * =====================================================
     * STATUS PRÜFEN
     * =====================================================
     *
     * Über diesen Endpunkt dürfen Produkte nur
     * aktiviert oder deaktiviert werden.
     */

    if (
      requestedStatus !== "active" &&
      requestedStatus !== "inactive"
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Ungültiger Produktstatus.",
          },
          {
            status: 400,
          }
        )
      );
    }


    /*
     * =====================================================
     * PRODUKT SUCHEN
     * =====================================================
     *
     * WICHTIG:
     * Zusätzlich zur Produkt-ID wird die customerId
     * geprüft.
     *
     * Dadurch kann ein Anbieter niemals den Status
     * eines Produktes eines anderen Anbieters ändern.
     */

    const existingProduct =
      await db.marketplaceProduct.findFirst({
        where: {
          id:
            String(productId),

          customerId,

          status: {
            not: "deleted",
          },
        },
      });


    if (!existingProduct) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Produkt wurde nicht gefunden.",
          },
          {
            status: 404,
          }
        )
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
          id:
            existingProduct.id,
        },

        data: {
          status:
            requestedStatus,
        },
      });


    /*
     * =====================================================
     * ERFOLGREICHE ANTWORT
     * =====================================================
     */

    return cors(
      Response.json({
        success: true,

        message:
          requestedStatus === "active"
            ? "Produkt wurde aktiviert."
            : "Produkt wurde deaktiviert.",

        product: {
          id:
            updatedProduct.id,

          title:
            updatedProduct.title,

          status:
            updatedProduct.status,

          shopifyProductId:
            updatedProduct.shopifyProductId,

          shopifyVariantId:
            updatedProduct.shopifyVariantId,

          shopifyHandle:
            updatedProduct.shopifyHandle,

          updatedAt:
            updatedProduct.updatedAt,
        },
      })
    );

  } catch (error) {
    console.error(
      "PRODUCT STATUS ERROR:",
      error
    );

    return cors(
      Response.json(
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
