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
 * SHOPIFY TAXONOMIEATTRIBUTE AUS DATENBANK LESEN
 * =========================================================
 */

function parseShopifyTaxonomyAttributes(value) {
  if (!value) {
    return [];
  }

  try {
    const attributes =
      typeof value === "string"
        ? JSON.parse(value)
        : value;

    if (!Array.isArray(attributes)) {
      return [];
    }

    return attributes
      .map((attribute) => {
        const attributeName =
          String(
            attribute?.attributeName || ""
          ).trim();

        const values =
          Array.isArray(attribute?.values)
            ? attribute.values
                .map((item) => ({
                  id:
                    String(
                      item?.id || ""
                    ).trim(),

                  name:
                    String(
                      item?.name || ""
                    ).trim(),
                }))
                .filter(
                  (item) =>
                    item.id &&
                    item.name
                )
            : [];

        if (
          !attributeName ||
          !values.length
        ) {
          return null;
        }

        return {
          attributeName,
          values,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error(
      "SHOPIFY TAXONOMY ATTRIBUTES PARSE ERROR:",
      error
    );

    return [];
  }
}

/*
 * =========================================================
 * SHOPIFY STANDARD-METAOBJECT SUCHEN
 * =========================================================
 *
 * Ein Shopify-Taxonomie-Wert wird über das Feld
 * "taxonomy_reference" mit einem Standard-Metaobject
 * verbunden.
 */

async function findShopifyTaxonomyMetaobject(
  admin,
  metaobjectType,
  taxonomyValueId
) {
  if (
    !admin ||
    !metaobjectType ||
    !taxonomyValueId
  ) {
    return null;
  }

  const response =
    await admin.graphql(
      `#graphql
        query FindTaxonomyMetaobject(
          $type: String!
        ) {
          metaobjects(
            type: $type
            first: 100
          ) {
            nodes {
              id
              handle
              type
              displayName

              taxonomyReference:
                field(
                  key: "taxonomy_reference"
                ) {
                  value
                }
            }
          }
        }
      `,
      {
        variables: {
          type: metaobjectType,
        },
      }
    );

  const result =
    await response.json();

  if (result?.errors?.length) {
    console.error(
      "SHOPIFY METAOBJECT LOOKUP ERRORS:",
      result.errors
    );

    return null;
  }

  const metaobjects =
    result?.data
      ?.metaobjects
      ?.nodes || [];

  return (
    metaobjects.find(
      (metaobject) =>
        metaobject
          ?.taxonomyReference
          ?.value ===
        taxonomyValueId
    ) || null
  );
}

/*
 * =========================================================
 * SHOPIFY KATEGORIE-METAFIELDS VORBEREITEN
 * =========================================================
 */

async function prepareShopifyTaxonomyMetafields(
  admin,
  attributes
) {
  if (
    !admin ||
    !Array.isArray(attributes) ||
    !attributes.length
  ) {
    return [];
  }

  /*
   * Bereits bestätigte Shopify-Standarddefinitionen.
   *
   * Nicht bekannte Attribute werden NICHT geraten.
   */
  const definitions = {
    "Color": {
      namespace: "shopify",
      key: "color-pattern",
      type: "list.metaobject_reference",
      metaobjectType:
        "shopify--color-pattern",
    },

    "Target gender": {
      namespace: "shopify",
      key: "target-gender",
      type: "list.metaobject_reference",
      metaobjectType:
        "shopify--target-gender",
    },

    "Fabric": {
      namespace: "shopify",
      key: "fabric",
      type: "list.metaobject_reference",
      metaobjectType:
        "shopify--fabric",
    },
  };

  const metafields = [];

  for (const attribute of attributes) {
    const definition =
      definitions[
        attribute?.attributeName
      ];

    if (!definition) {
      continue;
    }

    const metaobjectIds = [];

    for (
      const taxonomyValue of
      attribute.values || []
    ) {
      const metaobject =
        await findShopifyTaxonomyMetaobject(
          admin,
          definition.metaobjectType,
          taxonomyValue.id
        );

      if (metaobject?.id) {
        metaobjectIds.push(
          metaobject.id
        );
      }
    }

    const uniqueIds = [
      ...new Set(metaobjectIds),
    ];

    if (!uniqueIds.length) {
      console.warn(
        "SHOPIFY TAXONOMY METAOBJECT NOT FOUND:",
        {
          attribute:
            attribute.attributeName,

          values:
            attribute.values,
        }
      );

      continue;
    }

    metafields.push({
      namespace:
        definition.namespace,

      key:
        definition.key,

      type:
        definition.type,

      /*
       * list.metaobject_reference erwartet
       * eine JSON-Liste von Metaobject-GIDs.
       */
      value:
        JSON.stringify(uniqueIds),
    });
  }

  return metafields;
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

const compareAtPrice =
  subscription.compareAtPricesEnabled
    ? normalizePrice(
        product.compareAtPrice
      )
    : null;

const validCompareAtPrice =
  compareAtPrice !== null &&
  price !== null &&
  Number(compareAtPrice) >
    Number(price)
    ? compareAtPrice
    : null;

/*
 * =====================================================
 * ZUSÄTZLICHE SHOPIFY-PRODUKTDATEN
 * =====================================================
 */

const sku =
  product.sku
    ? String(product.sku).trim()
    : null;

const barcode =
  product.gtin
    ? String(product.gtin).trim()
    : null;

const productType =
  product.productType
    ? String(product.productType).trim()
    : product.category
      ? String(product.category).trim()
      : null;

/*
 * Shopify Standard Product Taxonomy
 *
 * Die ID wurde bereits beim Scrapen ermittelt und
 * serverseitig in PostgreSQL gespeichert.
 */

const shopifyTaxonomyId =
  product.shopifyTaxonomyId
    ? String(
        product.shopifyTaxonomyId
      ).trim()
    : null;

const shopifyTaxonomyAttributes =
  parseShopifyTaxonomyAttributes(
    product.shopifyTaxonomyAttributes
  );

const shopifyTaxonomyMetafields =
  await prepareShopifyTaxonomyMetafields(
    admin,
    shopifyTaxonomyAttributes
  );

console.log(
  "SHOPIFY TAXONOMY METAFIELDS:",
  shopifyTaxonomyMetafields
);

const metaTitle =
  product.metaTitle
    ? String(product.metaTitle).trim()
    : null;

const metaDescription =
  product.metaDescription
    ? String(product.metaDescription).trim()
    : null;

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
 * Produkttyp
 */

...(productType
  ? {
      productType,
    }
  : {}),

/*
 * Shopify Produktkategorie
 */

...(shopifyTaxonomyId
  ? {
      category:
        shopifyTaxonomyId,
    }
  : {}),

/*
 * SEO-DATEN
 */

...(
  metaTitle ||
  metaDescription
    ? {
        seo: {
          ...(metaTitle
            ? {
                title:
                  metaTitle,
              }
            : {}),

          ...(metaDescription
            ? {
                description:
                  metaDescription,
              }
            : {}),
        },
      }
    : {}
),

              /*
               * Anbieterprodukte zunächst immer
               * als Entwurf anlegen.
               */
              status:
                "DRAFT",

              metafields: [
...shopifyTaxonomyMetafields,

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
  (
    price !== null ||
    sku !== null ||
    barcode !== null
  )
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
  compareAtPrice
  barcode
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

    ...(price !== null
      ? {
          price,
        }
      : {}),

    compareAtPrice:
      validCompareAtPrice,

...(sku !== null
  ? {
      inventoryItem: {
        sku,
      },
    }
  : {}),

    ...(barcode !== null
      ? {
          barcode,
        }
      : {}),
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