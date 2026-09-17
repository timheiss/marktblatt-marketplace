import db from "../db.server";
import { authenticate } from "../shopify.server";

/*
 * =========================================================
 * PRODUKT LÖSCHEN
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
     * PRODUKT SUCHEN
     * =====================================================
     *
     * Zusätzlich zur Produkt-ID wird die echte
     * Shopify Customer ID geprüft.
     *
     * Dadurch kann ein Anbieter nur seine eigenen
     * Produkte löschen.
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
     * SOFT DELETE
     * =====================================================
     *
     * Der Datensatz bleibt in PostgreSQL bestehen.
     * Er wird lediglich als gelöscht markiert.
     */

    const deletedProduct =
      await db.marketplaceProduct.update({
        where: {
          id:
            existingProduct.id,
        },

        data: {
          status:
            "deleted",
        },
      });


    /*
     * =====================================================
     * NEUE PAKETBELEGUNG BERECHNEN
     * =====================================================
     *
     * Da gelöschte Produkte nicht mehr auf das
     * Produktlimit angerechnet werden, zählen wir
     * die verbleibenden Produkte neu.
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

    const subscription =
      await db.subscription.findUnique({
        where: {
          customerId,
        },
      });

    const productLimit =
      subscription?.productLimit ?? 0;

    const availableProducts =
      Math.max(
        productLimit - usedProducts,
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
          "Produkt wurde erfolgreich gelöscht.",

        product: {
          id:
            deletedProduct.id,

          title:
            deletedProduct.title,

          status:
            deletedProduct.status,

          shopifyProductId:
            deletedProduct.shopifyProductId,

          shopifyVariantId:
            deletedProduct.shopifyVariantId,

          shopifyHandle:
            deletedProduct.shopifyHandle,

          updatedAt:
            deletedProduct.updatedAt,
        },

        package: {
          productLimit,
          usedProducts,
          availableProducts,
        },
      })
    );

  } catch (error) {
    console.error(
      "PRODUCT DELETE ERROR:",
      error
    );

    return cors(
      Response.json(
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