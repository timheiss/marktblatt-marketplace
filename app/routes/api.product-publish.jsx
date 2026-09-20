import db from "../db.server";
import {
  authenticate,
  unauthenticated,
} from "../shopify.server";


/*
 * =========================================================
 * HTML SICHER BEREINIGEN
 * =========================================================
 */

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/*
 * =========================================================
 * PREIS NORMALISIEREN
 * =========================================================
 */

function normalizePrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  let price = String(value)
    .trim()
    .replace(/\s/g, "");

  if (
    price.includes(",") &&
    !price.includes(".")
  ) {
    price = price.replace(",", ".");
  }

  const number = Number(price);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return null;
  }

  return number.toFixed(2);
}


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
 * BILDER FÜR SHOPIFY VORBEREITEN
 * =========================================================
 */

function prepareMedia(product) {
  const images =
    parseImages(product.images);

  const seen = new Set();
  const media = [];

  for (const image of images) {
    if (
      !image ||
      typeof image !== "string"
    ) {
      continue;
    }

    try {
      const url = new URL(image);

      if (
        !["http:", "https:"].includes(
          url.protocol
        )
      ) {
        continue;
      }

      if (seen.has(url.href)) {
        continue;
      }

      seen.add(url.href);

      media.push({
        originalSource:
          url.href,

        mediaContentType:
          "IMAGE",

        alt:
          product.title ||
          "Produktbild",
      });

      if (media.length >= 5) {
        break;
      }
    } catch {
      // Ungültige Bild-URL ignorieren.
    }
  }

  return media;
}


/*
 * =========================================================
 * API ACTION
 * =========================================================
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
     * 2. NUR PRODUKT-ID AUS REQUEST ÜBERNEHMEN
     * =====================================================
     *
     * Produktdaten wie Preis, URL oder Anbieter werden
     * NICHT aus dem Browser übernommen.
     */

    const body =
      await request.json();

    const productId =
      body?.productId;

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
     * 3. PRODUKT AUS POSTGRESQL LADEN
     * =====================================================
     *
     * Gleichzeitig wird geprüft, ob das Produkt wirklich
     * dem angemeldeten Anbieter gehört.
     */

    const product =
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

    if (!product) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Produkt wurde nicht gefunden oder gehört nicht zu diesem Anbieter.",
          },
          {
            status: 404,
          }
        )
      );
    }


    /*
     * =====================================================
     * 4. DOPPELTE VERÖFFENTLICHUNG VERHINDERN
     * =====================================================
     */

    if (product.shopifyProductId) {
      return cors(
        Response.json(
          {
            success: false,

            error:
              "Dieses Produkt wurde bereits an Marktblatt übertragen.",

            product: {
              id:
                product.id,

              shopifyProductId:
                product.shopifyProductId,

              shopifyVariantId:
                product.shopifyVariantId,

              shopifyHandle:
                product.shopifyHandle,
            },
          },
          {
            status: 409,
          }
        )
      );
    }


    /*
     * =====================================================
     * 5. AKTIVES PAKET PRÜFEN
     * =====================================================
     */

    const subscription =
      await db.subscription.findUnique({
        where: {
          customerId,
        },
      });

    if (!subscription) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Für diesen Anbieter wurde kein Marktblatt-Paket gefunden.",
          },
          {
            status: 403,
          }
        )
      );
    }

    if (subscription.status !== "active") {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Das Marktblatt-Paket ist nicht aktiv.",
          },
          {
            status: 403,
          }
        )
      );
    }


    /*
     * =====================================================
     * 6. MARKTBLATT-SHOP FESTLEGEN
     * =====================================================
     *
     * Die Domain kommt ausschließlich aus der
     * serverseitigen Umgebungsvariable.
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
     * =====================================================
     * 7. ADMIN-API FÜR MARKTBLATT.ONLINE LADEN
     * =====================================================
     *
     * Dafür wird die bereits gespeicherte Offline-Session
     * des Marktblatt-Shops verwendet.
     */

    const { admin } =
      await unauthenticated.admin(
        marktblattShop
      );


    /*
     * =====================================================
     * 8. PRODUKTDATEN VORBEREITEN
     * =====================================================
     */

    const title =
      String(product.title).trim();

    if (!title) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Produkttitel fehlt.",
          },
          {
            status: 400,
          }
        )
      );
    }

    const description =
      product.description
        ? String(
            product.description
          ).trim()
        : "";

    const vendor =
      String(
        product.vendor ||
        product.brand ||
        "Marktblatt Anbieter"
      ).trim();

    const price =
      normalizePrice(
        product.price
      );

    const currency =
      product.currency
        ? String(
            product.currency
          )
            .trim()
            .toUpperCase()
        : "EUR";


    /*
     * ORIGINAL-URL PRÜFEN
     */

    let sourceUrl;

    try {
      const parsed =
        new URL(
          product.sourceUrl
        );

      if (
        !["http:", "https:"].includes(
          parsed.protocol
        )
      ) {
        throw new Error();
      }

      sourceUrl =
        parsed.href;
    } catch {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Die gespeicherte Original-Produkt-URL ist ungültig.",
          },
          {
            status: 400,
          }
        )
      );
    }

    const media =
      prepareMedia(product);


    /*
     * =====================================================
     * 9. SHOPIFY-PRODUKT ALS ENTWURF ANLEGEN
     * =====================================================
     */

    const createResponse =
      await admin.graphql(
        `#graphql
          mutation CreateMarketplaceProduct(
            $product: ProductCreateInput!
            $media: [CreateMediaInput!]
          ) {
            productCreate(
              product: $product
              media: $media
            ) {
              product {
                id
                title
                handle
                status
                vendor

                variants(first: 1) {
                  nodes {
                    id
                    price
                  }
                }

                media(first: 5) {
                  nodes {
                    id
                    alt
                    mediaContentType

                    preview {
                      status
                    }
                  }
                }
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
              title,

              descriptionHtml:
                description
                  ? `<p>${escapeHtml(
                      description
                    )}</p>`
                  : "",

              vendor,

              /*
               * Anbieterprodukte zunächst immer
               * als Entwurf anlegen.
               */
              status:
                "DRAFT",

              metafields: [
                {
                  namespace:
                    "marktblatt",

                  key:
                    "external_url",

                  type:
                    "url",

                  value:
                    sourceUrl,
                },

                {
                  namespace:
                    "marktblatt",

                  key:
                    "external_vendor",

                  type:
                    "single_line_text_field",

                  value:
                    vendor,
                },

                {
                  namespace:
                    "marktblatt",

                  key:
                    "external_product",

                  type:
                    "boolean",

                  value:
                    "true",
                },

                /*
                 * Interne Zuordnung zum Anbieter.
                 */
                {
                  namespace:
                    "marktblatt",

                  key:
                    "marketplace_customer_id",

                  type:
                    "single_line_text_field",

                  value:
                    String(customerId),
                },

                /*
                 * Interne Marktblatt-Produkt-ID.
                 */
                {
                  namespace:
                    "marktblatt",

                  key:
                    "marketplace_product_id",

                  type:
                    "single_line_text_field",

                  value:
                    String(product.id),
                },
              ],
            },

            media,
          },
        }
      );

    const createResult =
      await createResponse.json();


    /*
     * =====================================================
     * 10. GRAPHQL-FEHLER PRÜFEN
     * =====================================================
     */

    if (
      createResult?.errors?.length
    ) {
      console.error(
        "SHOPIFY GRAPHQL ERRORS:",
        createResult.errors
      );

      throw new Error(
        createResult.errors
          .map(
            (error) =>
              error.message
          )
          .join(", ")
      );
    }

    const createErrors =
      createResult?.data
        ?.productCreate
        ?.userErrors || [];

    if (
      createErrors.length > 0
    ) {
      console.error(
        "SHOPIFY PRODUCT CREATE ERRORS:",
        createErrors
      );

      return cors(
        Response.json(
          {
            success: false,

            error:
              createErrors
                .map(
                  (item) =>
                    item.message
                )
                .join(", "),
          },
          {
            status: 400,
          }
        )
      );
    }

    const createdProduct =
      createResult?.data
        ?.productCreate
        ?.product;

    if (!createdProduct) {
      throw new Error(
        "Shopify hat kein Produkt zurückgegeben."
      );
    }

    const shopifyProductId =
      createdProduct.id;

    const firstVariant =
      createdProduct
        ?.variants
        ?.nodes?.[0];


    /*
     * =====================================================
     * 11. PREIS DER STANDARDVARIANTE SETZEN
     * =====================================================
     */

    let finalPrice =
      firstVariant?.price ||
      null;

    if (
      firstVariant?.id &&
      price !== null
    ) {
      const variantResponse =
        await admin.graphql(
          `#graphql
            mutation UpdateMarketplaceVariant(
              $productId: ID!
              $variants: [ProductVariantsBulkInput!]!
            ) {
              productVariantsBulkUpdate(
                productId: $productId
                variants: $variants
              ) {
                productVariants {
                  id
                  price
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
              productId:
                shopifyProductId,

              variants: [
                {
                  id:
                    firstVariant.id,

                  price,
                },
              ],
            },
          }
        );

      const variantResult =
        await variantResponse.json();

      if (
        variantResult?.errors?.length
      ) {
        console.error(
          "SHOPIFY VARIANT GRAPHQL ERRORS:",
          variantResult.errors
        );

        throw new Error(
          variantResult.errors
            .map(
              (error) =>
                error.message
            )
            .join(", ")
        );
      }

      const variantErrors =
        variantResult?.data
          ?.productVariantsBulkUpdate
          ?.userErrors || [];

      if (
        variantErrors.length > 0
      ) {
        console.error(
          "SHOPIFY PRICE ERRORS:",
          variantErrors
        );

        throw new Error(
          variantErrors
            .map(
              (item) =>
                item.message
            )
            .join(", ")
        );
      }

      finalPrice =
        variantResult?.data
          ?.productVariantsBulkUpdate
          ?.productVariants?.[0]
          ?.price ||
        price;
    }


    /*
     * =====================================================
     * 12. SHOPIFY-ZUORDNUNG IN POSTGRESQL SPEICHERN
     * =====================================================
     */

    const updatedProduct =
      await db.marketplaceProduct.update({
        where: {
          id:
            product.id,
        },

        data: {
          shopifyProductId,

          shopifyVariantId:
            firstVariant?.id ||
            null,

          shopifyHandle:
            createdProduct.handle ||
            null,
        },
      });


    /*
     * =====================================================
     * 13. ERFOLG
     * =====================================================
     */

    return cors(
      Response.json({
        success: true,

        message:
          "Produkt wurde als Entwurf an Marktblatt.online übertragen.",

        product: {
          id:
            updatedProduct.id,

          shopifyProductId:
            updatedProduct.shopifyProductId,

          shopifyVariantId:
            updatedProduct.shopifyVariantId,

          shopifyHandle:
            updatedProduct.shopifyHandle,

          title:
            createdProduct.title,

          vendor:
            createdProduct.vendor,

          status:
            createdProduct.status,

          price:
            finalPrice,

          currency,

          sourceUrl,

          imageCount:
            media.length,
        },
      })
    );

  } catch (error) {
    console.error(
      "PRODUCT PUBLISH ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,

          error:
            error instanceof Error
              ? error.message
              : "Produkt konnte nicht veröffentlicht werden.",
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
 *
 * CORS-Unterstützung für die Shopify
 * Customer Account Extension.
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