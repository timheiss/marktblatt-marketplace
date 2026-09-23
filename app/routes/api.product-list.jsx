import db from "../db.server";
import { authenticate } from "../shopify.server";

/*
 * =========================================================
 * CORS
 * =========================================================
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};


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

export const loader = async ({ request }) => {

  /*
   * =======================================================
   * CORS PREFLIGHT
   * =======================================================
   */

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }


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
            headers: corsHeaders,
          }
        )
      );
    }


    /*
     * =====================================================
     * MARKTBLATT-PAKET LADEN
     * =====================================================
     */

    const subscription =
      await db.subscription.findUnique({
        where: {
          customerId,
        },
      });


    /*
     * =====================================================
     * PRODUKTE DES KUNDEN LADEN
     * =====================================================
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
     * =====================================================
     * PRODUKTDATEN VORBEREITEN
     * =====================================================
     */

    const formattedProducts =
      products.map((product) => {

        const images =
          parseImages(
            product.images
          );

        return {
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

          /*
           * Zusätzliche Produktdaten
           */

          sku:
            product.sku,

          gtin:
            product.gtin,

          mpn:
            product.mpn,

          category:
            product.category,

          productType:
            product.productType,

          material:
            product.material,

          color:
            product.color,

          size:
            product.size,

          /*
           * SEO / Meta-Daten
           */

          metaTitle:
            product.metaTitle,

          metaDescription:
            product.metaDescription,

          /*
           * Google / Merchant Produktdaten
           */

          condition:
            product.condition,

          gender:
            product.gender,

          ageGroup:
            product.ageGroup,

          adult:
            product.adult,

          itemGroupId:
            product.itemGroupId,

          /*
           * Streichpreis
           */

          compareAtPrice:
            product.compareAtPrice,

          compareAtPriceSource:
            product.compareAtPriceSource,

          sourceUrl:
            product.sourceUrl,

          images,

          image:
            images[0] || null,

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
        };
      });


    /*
     * =====================================================
     * PAKETBELEGUNG
     * =====================================================
     */

    const usedProducts =
      formattedProducts.length;


    /*
     * Kunde hat noch kein Paket
     */

    if (!subscription) {
      return cors(
        Response.json(
          {
            success: true,

            products:
              formattedProducts,

            productCount:
              formattedProducts.length,

            hasSubscription:
              false,

            package: {
              name: null,

              status: null,

              productLimit: 0,

              usedProducts,

              availableProducts: 0,
            },
          },
          {
            headers: corsHeaders,
          }
        )
      );
    }


    const productLimit =
      subscription.productLimit;

    const availableProducts =
      Math.max(
        productLimit -
          usedProducts,
        0
      );


    /*
     * =====================================================
     * ERFOLGREICHE ANTWORT
     * =====================================================
     */

    return cors(
      Response.json(
        {
          success: true,

          products:
            formattedProducts,

          productCount:
            formattedProducts.length,

          hasSubscription:
            true,

          package: {
            name:
              subscription.package,

            status:
              subscription.status,

            productLimit,

            usedProducts,

            availableProducts,

compareAtPricesEnabled:
  subscription.compareAtPricesEnabled,

            currentPeriodStart:
              subscription.currentPeriodStart,

            currentPeriodEnd:
              subscription.currentPeriodEnd,
          },
        },
        {
          headers: corsHeaders,
        }
      )
    );

  } catch (error) {

    console.error(
      "PRODUCT LIST ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,

          error:
            error instanceof Error
              ? error.message
              : "Produkte konnten nicht geladen werden.",
        },
        {
          status: 500,
          headers: corsHeaders,
        }
      )
    );
  }
};