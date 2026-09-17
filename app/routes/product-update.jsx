import db from "../db.server";
import { authenticate } from "../shopify.server";

/*
 * =========================================================
 * PRODUKT AKTUALISIEREN
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

    const title =
      body?.title !== undefined
        ? String(body.title).trim()
        : "";

    const description =
      body?.description !== undefined
        ? String(body.description).trim()
        : "";

    const price =
      body?.price !== undefined &&
      body?.price !== null
        ? String(body.price).trim()
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
     * PREIS PRÜFEN
     * =====================================================
     */

    let normalizedPrice = null;

    if (price !== "") {
      let preparedPrice =
        price.replace(/\s/g, "");

      /*
       * Deutsches Dezimaltrennzeichen unterstützen.
       */

      if (
        preparedPrice.includes(",") &&
        !preparedPrice.includes(".")
      ) {
        preparedPrice =
          preparedPrice.replace(",", ".");
      }

      const priceNumber =
        Number(preparedPrice);

      if (
        !Number.isFinite(priceNumber) ||
        priceNumber < 0
      ) {
        return cors(
          Response.json(
            {
              success: false,
              error:
                "Bitte geben Sie einen gültigen Preis ein.",
            },
            {
              status: 400,
            }
          )
        );
      }

      normalizedPrice =
        priceNumber.toFixed(2);
    }


    /*
     * =====================================================
     * PRODUKT SUCHEN
     * =====================================================
     *
     * Produkt-ID UND echte Shopify Customer ID werden
     * geprüft.
     *
     * Dadurch kann ein Anbieter niemals ein Produkt
     * eines anderen Anbieters bearbeiten.
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

          price:
            normalizedPrice,
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