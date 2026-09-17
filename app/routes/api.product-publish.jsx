import { authenticate } from "../shopify.server";

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

  /*
   * Unterstützt z.B.
   *
   * 23
   * 23.00
   * 23,00
   */
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
 * BILDER FÜR SHOPIFY VORBEREITEN
 * =========================================================
 */

function prepareMedia(product) {
  if (!Array.isArray(product?.images)) {
    return [];
  }

  const seen = new Set();
  const media = [];

  for (const image of product.images) {
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

      /*
       * Nur eindeutige URLs übernehmen.
       */
      const key = url.href;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      media.push({
        originalSource: url.href,
        mediaContentType: "IMAGE",
        alt: product.title || "Produktbild",
      });

      /*
       * Maximal 10 Bilder.
       */
      if (media.length >= 10) {
        break;
      }
    } catch {
      /*
       * Ungültige Bild-URL ignorieren.
       */
    }
  }

  return media;
}


/*
 * =========================================================
 * API ACTION
 * =========================================================
 */

export const action = async ({
  request,
}) => {
  try {
    const body =
      await request.json();

    const product =
      body?.product;

    /*
     * =====================================================
     * EINGABEDATEN PRÜFEN
     * =====================================================
     */

    if (!product) {
      return Response.json(
        {
          success: false,
          error:
            "Keine Produktdaten übermittelt.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !product.title ||
      !String(product.title).trim()
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Produkttitel fehlt.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !product.sourceUrl ||
      !String(product.sourceUrl).trim()
    ) {
      return Response.json(
        {
          success: false,
          error:
            "Original-Produkt-URL fehlt.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ORIGINAL-URL PRÜFEN
     */

    let sourceUrl;

    try {
      const parsed =
        new URL(product.sourceUrl);

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
      return Response.json(
        {
          success: false,
          error:
            "Die Original-Produkt-URL ist ungültig.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =====================================================
     * SHOPIFY ADMIN AUTHENTIFIZIEREN
     * =====================================================
     */

    const { admin } =
      await authenticate.admin(
        request
      );

    /*
     * =====================================================
     * DATEN VORBEREITEN
     * =====================================================
     */

    const title =
      String(product.title)
        .trim();

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
          ).toUpperCase()
        : "EUR";

    const media =
      prepareMedia(product);

    /*
     * =====================================================
     * 1. SHOPIFY-PRODUKT + BILDER ANLEGEN
     * =====================================================
     *
     * Bilder werden direkt über productCreate(media: ...)
     * an Shopify übergeben.
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

                media(first: 10) {
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
               * Neue Anbieterprodukte zunächst
               * immer als ENTWURF anlegen.
               */
              status: "DRAFT",

              /*
               * Marktblatt-spezifische Daten.
               */
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
     * GRAPHQL-FEHLER PRÜFEN
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

      return Response.json(
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
     * 2. PREIS DER STANDARDVARIANTE SETZEN
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
          ?.price || price;
    }

    /*
     * =====================================================
     * 3. ERGEBNIS
     * =====================================================
     */

    return Response.json({
      success: true,

      message:
        "Produkt wurde als Entwurf im Marktblatt-Shop angelegt.",

      product: {
        shopifyProductId,

        shopifyVariantId:
          firstVariant?.id ||
          null,

        title:
          createdProduct.title,

        handle:
          createdProduct.handle,

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
    });

  } catch (error) {
    console.error(
      "PRODUCT PUBLISH ERROR:",
      error
    );

    return Response.json(
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
    );
  }
};


/*
 * =========================================================
 * GET-AUFRUF
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
