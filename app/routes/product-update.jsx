import db from "../db.server";

/*
 * =========================================================
 * ENTWICKLUNG
 * =========================================================
 *
 * Später kommt die echte Shopify Customer ID
 * aus dem eingeloggten Kundenkonto.
 */

const DEVELOPMENT_CUSTOMER_ID =
  "development-test-customer";


/*
 * =========================================================
 * API ACTION
 * =========================================================
 */

export const action = async ({ request }) => {
  try {
    const body = await request.json();

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


    if (!title) {
      return Response.json(
        {
          success: false,
          error:
            "Bitte geben Sie einen Produkttitel ein.",
        },
        {
          status: 400,
        }
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
        return Response.json(
          {
            success: false,
            error:
              "Bitte geben Sie einen gültigen Preis ein.",
          },
          {
            status: 400,
          }
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
     * Wichtig:
     * Wir suchen nicht nur anhand der Produkt-ID,
     * sondern zusätzlich anhand des Eigentümers.
     *
     * Dadurch kann ein Anbieter nicht einfach die ID
     * eines fremden Produktes übergeben.
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
     * PRODUKT AKTUALISIEREN
     * =====================================================
     */

    const updatedProduct =
      await db.marketplaceProduct.update({
        where: {
          id: existingProduct.id,
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
     * ERFOLG
     * =====================================================
     */

    return Response.json({
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
    });

  } catch (error) {
    console.error(
      "PRODUCT UPDATE ERROR:",
      error
    );

    return Response.json(
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
