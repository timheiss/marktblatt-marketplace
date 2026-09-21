import db from "../db.server";
import {
  authenticate,
  unauthenticated,
} from "../shopify.server";


/*
 * =========================================================
 * PRODUKTSTATUS ÄNDERN
 * =========================================================
 *
 * active:
 * - MarketplaceProduct.status = active
 * - bereits übertragenes Shopify-Produkt = ACTIVE
 *
 * inactive:
 * - MarketplaceProduct.status = inactive
 * - bereits übertragenes Shopify-Produkt = DRAFT
 *
 * Noch nicht übertragene Produkte werden nur in der
 * Marketplace-Datenbank aktiviert/deaktiviert.
 */


export const action = async ({ request }) => {
  let cors = (response) => response;

  try {
    /*
     * =====================================================
     * 1. SHOPIFY-KUNDEN AUTHENTIFIZIEREN
     * =====================================================
     */

    const authentication =
      await authenticate.public.customerAccount(
        request
      );

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
     * 2. REQUEST-DATEN LADEN
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
     * 3. PRODUKT-ID PRÜFEN
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
     * 4. STATUS PRÜFEN
     * =====================================================
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
     * 5. PRODUKT SUCHEN
     * =====================================================
     *
     * Die customerId wird mitgeprüft.
     * Dadurch kann ein Anbieter nur seine eigenen
     * Produkte aktivieren oder deaktivieren.
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
     * 6. SHOPIFY-PRODUKT SYNCHRONISIEREN
     * =====================================================
     *
     * Nur wenn das Produkt bereits an Marktblatt
     * übertragen wurde.
     *
     * active   -> ACTIVE
     * inactive -> DRAFT
     */

    if (existingProduct.shopifyProductId) {

      /*
       * Marktblatt-Shop ausschließlich aus der
       * serverseitigen Umgebungsvariable laden.
       */

      const marktblattShop =
        process.env.MARKTBLATT_SHOP;

      if (!marktblattShop) {
        throw new Error(
          "MARKTBLATT_SHOP ist auf dem Server nicht konfiguriert."
        );
      }

      if (
        !marktblattShop.endsWith(
          ".myshopify.com"
        )
      ) {
        throw new Error(
          "MARKTBLATT_SHOP enthält keine gültige Shopify-Shop-Domain."
        );
      }


      /*
       * Admin API des Marktblatt-Shops laden.
       */

      const { admin } =
        await unauthenticated.admin(
          marktblattShop
        );


      /*
       * Gewünschten Shopify-Status bestimmen.
       */

      const shopifyStatus =
        requestedStatus === "active"
          ? "ACTIVE"
          : "DRAFT";


      /*
       * Shopify-Produkt aktualisieren.
       */

      const shopifyResponse =
        await admin.graphql(
          `#graphql
            mutation ProductStatusUpdate(
              $product: ProductUpdateInput!
            ) {
              productUpdate(product: $product) {
                product {
                  id
                  status
                }

                userErrors {
                  field
                  message
                }
              }
            }
          `,
          {
            variables: {
              product: {
                id:
                  existingProduct.shopifyProductId,

                status:
                  shopifyStatus,
              },
            },
          }
        );


      const shopifyData =
        await shopifyResponse.json();

      const userErrors =
        shopifyData?.data
          ?.productUpdate
          ?.userErrors ?? [];


      /*
       * Wenn Shopify die Änderung ablehnt,
       * wird der Datenbankstatus NICHT geändert.
       */

      if (userErrors.length > 0) {
        throw new Error(
          userErrors
            .map((error) => error.message)
            .join(" ")
        );
      }


      const changedShopifyProduct =
        shopifyData?.data
          ?.productUpdate
          ?.product;


      if (!changedShopifyProduct?.id) {
        throw new Error(
          "Der Produktstatus konnte bei Shopify nicht geändert werden."
        );
      }
    }


    /*
     * =====================================================
     * 7. STATUS IN POSTGRESQL SPEICHERN
     * =====================================================
     *
     * Dieser Schritt erfolgt bewusst erst NACH der
     * erfolgreichen Shopify-Änderung.
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
     * 8. ERFOLGREICHE ANTWORT
     * =====================================================
     */

    return cors(
      Response.json({
        success: true,

        message:
          requestedStatus === "active"
            ? existingProduct.shopifyProductId
              ? "Produkt wurde aktiviert und auf Marktblatt veröffentlicht."
              : "Produkt wurde aktiviert."
            : existingProduct.shopifyProductId
              ? "Produkt wurde deaktiviert und auf Marktblatt ausgeblendet."
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
 * OPTIONS / GET
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