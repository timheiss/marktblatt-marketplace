import db from "../db.server";
import { authenticate } from "../shopify.server";

/*
 * =========================================================
 * PRODUKT AKTUALISIEREN
 * =========================================================
 *
 * Der Kunde darf bearbeiten:
 *
 * - Produkttitel
 * - Produktbeschreibung
 *
 * Der Preis darf NICHT vom Kunden geändert werden.
 * Er stammt ausschließlich aus der ursprünglichen
 * Produktseite bzw. dem Marktblatt-Scraper.
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
     *
     * WICHTIG:
     *
     * price wird absichtlich NICHT aus dem Request
     * übernommen.
     */

    const body =
      await request.json();

    const productId =
      body?.productId;

    const title =
      body?.title !== undefined
        ? String(body.title).trim()
        : "";

    const description =
      body?.description !== undefined
        ? String(body.description).trim()
        : "";


    /*
     * =====================================================
     * EINGABEN PRÜFEN
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

    if (!title) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Bitte geben Sie einen Produkttitel ein.",
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
     * Produkt-ID UND Shopify Customer ID werden geprüft.
     *
     * Dadurch kann ein Anbieter kein Produkt eines
     * anderen Anbieters bearbeiten.
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
     * PRODUKT AKTUALISIEREN
     * =====================================================
     *
     * Preis, Währung, Anbieter, Original-URL usw.
     * bleiben unverändert.
     */

    const updatedProduct =
      await db.marketplaceProduct.update({
        where: {
          id:
            existingProduct.id,
        },

        data: {
          title,

          description:
            description || null,
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
          "Änderungen wurden erfolgreich gespeichert.",

        product: {
          id:
            updatedProduct.id,

          title:
            updatedProduct.title,

          description:
            updatedProduct.description,

          /*
           * Der unveränderte Originalpreis wird
           * lediglich zurückgegeben.
           */

          price:
            updatedProduct.price,

          currency:
            updatedProduct.currency,

          vendor:
            updatedProduct.vendor,

          brand:
            updatedProduct.brand,

          sourceUrl:
            updatedProduct.sourceUrl,

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
      "PRODUCT UPDATE ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,

          error:
            error instanceof Error
              ? error.message
              : "Produkt konnte nicht aktualisiert werden.",
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