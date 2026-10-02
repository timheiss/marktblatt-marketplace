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
 * BILDER FÃƒÅ“R SHOPIFY VORBEREITEN
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
      // UngÃƒÂ¼ltige Bild-URL ignorieren.
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
const attributeId =
  String(
    attribute?.attributeId || ""
  ).trim();

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
  attributeId,
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
 * Ein Shopify-Taxonomie-Wert wird ÃƒÂ¼ber das Feld
 * "taxonomy_reference" mit einem Standard-Metaobject
 * verbunden.
 */

async function findShopifyTaxonomyMetaobject(
  admin,
  metaobjectType,
  taxonomyValueId,
  taxonomyValueName = null
) {
  if (
    !admin ||
    !metaobjectType ||
    !taxonomyValueId
  ) {
    return null;
  }

  /*
   * =======================================================
   * 1. VORHANDENES METAOBJECT SUCHEN
   * =======================================================
   */

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

colorTaxonomyReference:
  field(
    key: "color_taxonomy_reference"
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

const existingMetaobject =
  metaobjects.find(
    (metaobject) => {
      /*
       * Normale Shopify-Taxonomie-Metaobjects:
       * taxonomy_reference enthÃƒÂ¤lt eine einzelne
       * TaxonomyValue-GID.
       */
      if (
        metaobject
          ?.taxonomyReference
          ?.value ===
        taxonomyValueId
      ) {
        return true;
      }

      /*
       * Color Pattern ist ein Sonderfall:
       * color_taxonomy_reference ist eine Liste
       * von TaxonomyValue-GIDs.
       */
      const colorReferenceValue =
        metaobject
          ?.colorTaxonomyReference
          ?.value;

      if (!colorReferenceValue) {
        return false;
      }

      try {
        const colorReferences =
          JSON.parse(
            colorReferenceValue
          );

        return (
          Array.isArray(colorReferences) &&
          colorReferences.includes(
            taxonomyValueId
          )
        );
      } catch {
        return false;
      }
    }
  ) || null;

  if (existingMetaobject) {
    console.log(
      "SHOPIFY TAXONOMY METAOBJECT FOUND:",
      {
        metaobjectType,
        taxonomyValueId,
        metaobjectId:
          existingMetaobject.id,
        displayName:
          existingMetaobject.displayName,
      }
    );

    return existingMetaobject;
  }


  /*
   * =======================================================
   * 2. FEHLENDES STANDARD-METAOBJECT ERSTELLEN
   * =======================================================
   *
   * Vorerst ausschlieÃƒÅ¸lich Fabric.
   *
   * FÃƒÂ¼r shopify--fabric wurden die Pflichtfelder
   * label und taxonomy_reference ÃƒÂ¼ber die echte
   * Shopify-Definition bestÃƒÂ¤tigt.
   */

  /*
   * =======================================================
   * METAOBJECT-DEFINITION DYNAMISCH LADEN
   * =======================================================
   */

  const definitionResponse =
    await admin.graphql(
      `#graphql
        query TaxonomyMetaobjectDefinition(
          $type: String!
        ) {
          metaobjectDefinitionByType(
            type: $type
          ) {
            id
            name
            type

            fieldDefinitions {
              key
              name
              required

              type {
                name
              }

              validations {
                name
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

  const definitionResult =
    await definitionResponse.json();

  if (definitionResult?.errors?.length) {
    console.error(
      "SHOPIFY METAOBJECT DEFINITION ERRORS:",
      definitionResult.errors
    );

    return null;
  }

  const metaobjectDefinition =
    definitionResult?.data
      ?.metaobjectDefinitionByType ||
    null;

console.log(
  "SHOPIFY TAXONOMY METAOBJECT DEFINITION:",
  JSON.stringify(
    {
      metaobjectType,
      definition: metaobjectDefinition,
    },
    null,
    2
  )
);

const isColorPattern =
  metaobjectType ===
  "shopify--color-pattern";

const fieldDefinitions =
  Array.isArray(
    metaobjectDefinition?.fieldDefinitions
  )
    ? metaobjectDefinition.fieldDefinitions
    : [];

const labelField =
  fieldDefinitions.find(
    (field) =>
      field?.key === "label"
  ) || null;

const taxonomyReferenceField =
  fieldDefinitions.find(
    (field) =>
      field?.key ===
      "taxonomy_reference"
  ) || null;

const supportsSimpleTaxonomyMetaobject =
  Boolean(
    labelField &&
      taxonomyReferenceField &&
      taxonomyReferenceField
        ?.type
        ?.name ===
        "product_taxonomy_value_reference"
  );

if (
  (
    !supportsSimpleTaxonomyMetaobject &&
    !isColorPattern
  ) ||
  !taxonomyValueName
) {
  console.log(
    "SHOPIFY TAXONOMY METAOBJECT NOT SUPPORTED:",
    {
      metaobjectType,
      taxonomyValueId,
      taxonomyValueName,
      fieldDefinitions:
        fieldDefinitions.map(
          (field) => ({
            key: field?.key,
            required: field?.required,
            type:
              field?.type?.name,
          })
        ),
    }
  );

  return null;
}

  const createResponse =
    await admin.graphql(
      `#graphql
        mutation CreateTaxonomyMetaobject(
          $metaobject: MetaobjectCreateInput!
        ) {
          metaobjectCreate(
            metaobject: $metaobject
          ) {
            metaobject {
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
colorTaxonomyReference:
  field(
    key: "color_taxonomy_reference"
  ) {
    value
  }
            }

            userErrors {
              field
              message
              code
            }
          }
        }
      `,
      {
        variables: {
          metaobject: {
            type: metaobjectType,

           fields:
  isColorPattern
    ? [
        {
          key: "label",
          value:
            String(
              taxonomyValueName
            ).trim(),
        },

        /*
         * Shopify erwartet hier eine Liste.
         */
        {
          key:
            "color_taxonomy_reference",

          value:
            JSON.stringify([
              taxonomyValueId,
            ]),
        },

        /*
         * Ein normaler einzelner Farbwert
         * wird als "Solid" behandelt.
         *
         * Shopify Taxonomy:
         * Pattern -> Solid
         */
        {
          key:
            "pattern_taxonomy_reference",

          value:
            "gid://shopify/TaxonomyValue/2874",
        },
      ]
    : [
        {
          key: "label",
          value:
            String(
              taxonomyValueName
            ).trim(),
        },

        {
          key:
            "taxonomy_reference",

          value:
            taxonomyValueId,
        },
      ],
          },
        },
      }
    );

  const createResult =
    await createResponse.json();

  if (
    createResult?.errors?.length
  ) {
    console.error(
      "SHOPIFY METAOBJECT CREATE GRAPHQL ERRORS:",
      createResult.errors
    );

    return null;
  }

  const createErrors =
    createResult?.data
      ?.metaobjectCreate
      ?.userErrors || [];

  if (createErrors.length > 0) {
    console.error(
      "SHOPIFY METAOBJECT CREATE USER ERRORS:",
      createErrors
    );

    return null;
  }

  const createdMetaobject =
    createResult?.data
      ?.metaobjectCreate
      ?.metaobject || null;

  if (createdMetaobject?.id) {
    console.log(
      "SHOPIFY TAXONOMY METAOBJECT CREATED:",
      {
        metaobjectType,
        taxonomyValueId,
        taxonomyValueName,
        metaobjectId:
          createdMetaobject.id,
        displayName:
          createdMetaobject.displayName,
      }
    );
  }

  return createdMetaobject;
}

/*
 * =========================================================
 * SHOPIFY KATEGORIE-METAFIELDS VORBEREITEN
 * =========================================================
 */

async function prepareShopifyTaxonomyMetafields(
  admin,
  shopifyTaxonomyId,
  attributes
) {
  if (
    !admin ||
    !shopifyTaxonomyId ||
    !Array.isArray(attributes) ||
    !attributes.length
  ) {
    return [];
  }

  /*
   * =======================================================
   * 1. SHOPIFY-STANDARD-METAFIELD-DEFINITIONEN LADEN
   * =======================================================
   *
   * Keine Attribute mehr fest im Code hinterlegen.
   *
   * Shopify liefert uns selbst:
   * - Name
   * - Namespace
   * - Key
   * - Typ
   *
   * Beispiele:
   * Age group    -> shopify.age-group
   * Jewelry type -> shopify.jewelry-type
   * Color        -> shopify.color-pattern
   */

  /*
   * =======================================================
   * 1. KATEGORIE-METAFIELD-DEFINITIONEN LADEN
   * =======================================================
   *
   * Shopify liefert nur die Metafields, die fÃƒÂ¼r die
   * tatsÃƒÂ¤chlich erkannte Produktkategorie gelten.
   *
   * Dadurch funktioniert dies dynamisch fÃƒÂ¼r Schmuck,
   * Handys, Werkzeuge usw.
   */

  const definitionsResponse =
    await admin.graphql(
      `#graphql
        query CategoryMetafieldDefinitions(
          $constraintSubtype: MetafieldDefinitionConstraintSubtypeIdentifier!
        ) {
          metafieldDefinitions(
            ownerType: PRODUCT
            first: 100
            constraintSubtype: $constraintSubtype
          ) {
            nodes {
              id
              name
              namespace
              key

              type {
                name
              }

              validations {
                name
                value
              }
            }
          }
        }
      `,
      {
        variables: {
          constraintSubtype: {
            key: "category",
            value:
              shopifyTaxonomyId,
          },
        },
      }
    );

  const definitionsResult =
    await definitionsResponse.json();

  if (definitionsResult?.errors?.length) {
    console.error(
      "SHOPIFY CATEGORY METAFIELD DEFINITION ERRORS:",
      definitionsResult.errors
    );

    return [];
  }

  const productDefinitions =
    definitionsResult?.data
      ?.metafieldDefinitions
      ?.nodes || [];

console.log(
  "SHOPIFY CATEGORY METAFIELD DEFINITIONS:",
  productDefinitions.map(
    (definition) => ({
      name: definition.name,
      namespace: definition.namespace,
      key: definition.key,
      type: definition?.type?.name,
      validations:
        definition.validations,
    })
  )
);

  /*
   * =======================================================
   * NOCH NICHT AKTIVIERTE SHOPIFY-STANDARDTEMPLATES LADEN
   * =======================================================
   *
   * Falls ein Taxonomieattribut fÃƒÂ¼r die Produktkategorie
   * existiert, aber die entsprechende Metafield-Definition
   * im Shop noch nicht aktiviert wurde, kÃƒÂ¶nnen wir hier das
   * offizielle Shopify-Template finden.
   */

  const templatesResponse =
    await admin.graphql(
      `#graphql
        query CategoryStandardMetafieldTemplates(
          $constraintSubtype: MetafieldDefinitionConstraintSubtypeIdentifier!
        ) {
          standardMetafieldDefinitionTemplates(
            first: 250
            constraintSubtype: $constraintSubtype
            excludeActivated: true
          ) {
            nodes {
              id
              name
              namespace
              key
              ownerTypes

              type {
                name
              }
            }
          }
        }
      `,
      {
        variables: {
          constraintSubtype: {
            key: "category",
            value: shopifyTaxonomyId,
          },
        },
      }
    );

  const templatesResult =
    await templatesResponse.json();

  if (templatesResult?.errors?.length) {
    console.error(
      "SHOPIFY STANDARD METAFIELD TEMPLATE ERRORS:",
      templatesResult.errors
    );

    return [];
  }

  const standardTemplates =
    templatesResult?.data
      ?.standardMetafieldDefinitionTemplates
      ?.nodes || [];

  const metafields = [];

  /*
   * =======================================================
   * 2. ERKANNTE TAXONOMIEATTRIBUTE VERARBEITEN
   * =======================================================
   */

  for (const attribute of attributes) {
    const attributeName =
      String(
        attribute?.attributeName || ""
      ).trim();

    if (!attributeName) {
      continue;
    }

    /*
     * Passende Shopify-Standarddefinition anhand
     * des echten Attributnamens suchen.
     */

    let definition =
      productDefinitions.find(
        (item) =>
          String(item?.name || "")
            .trim()
            .toLowerCase() ===
          attributeName.toLowerCase()
      ) || null;

    /*
     * =====================================================
     * FEHLENDE SHOPIFY-STANDARDDEFINITION AKTIVIEREN
     * =====================================================
     */

    if (!definition) {
      const template =
        standardTemplates.find(
          (item) =>
            Array.isArray(item?.ownerTypes) &&
            item.ownerTypes.includes("PRODUCT") &&
            String(item?.name || "")
              .trim()
              .toLowerCase() ===
              attributeName.toLowerCase()
        ) || null;

      if (!template?.id) {
        console.log(
          "SHOPIFY STANDARD METAFIELD TEMPLATE NOT FOUND:",
          {
            attribute: attributeName,
          }
        );

        continue;
      }

      console.log(
        "SHOPIFY STANDARD METAFIELD ENABLING:",
        {
          attribute: attributeName,
          templateId: template.id,
          namespace: template.namespace,
          key: template.key,
          type: template?.type?.name,
        }
      );

      const enableResponse =
        await admin.graphql(
          `#graphql
            mutation EnableStandardMetafieldDefinition(
              $ownerType: MetafieldOwnerType!
              $id: ID!
            ) {
              standardMetafieldDefinitionEnable(
                ownerType: $ownerType
                id: $id
              ) {
                createdDefinition {
                  id
                  name
                  namespace
                  key

                  type {
                    name
                  }
                }

                userErrors {
                  field
                  message
                  code
                }
              }
            }
          `,
          {
            variables: {
              ownerType: "PRODUCT",
              id: template.id,
            },
          }
        );

      const enableResult =
        await enableResponse.json();

      if (enableResult?.errors?.length) {
        console.error(
          "SHOPIFY STANDARD METAFIELD ENABLE GRAPHQL ERRORS:",
          enableResult.errors
        );

        continue;
      }

      const enablePayload =
        enableResult?.data
          ?.standardMetafieldDefinitionEnable;

      const enableErrors =
        enablePayload?.userErrors || [];

      if (enableErrors.length) {
        console.error(
          "SHOPIFY STANDARD METAFIELD ENABLE USER ERRORS:",
          {
            attribute: attributeName,
            errors: enableErrors,
          }
        );

        continue;
      }

      definition =
        enablePayload?.createdDefinition ||
        null;

      if (!definition) {
        console.error(
          "SHOPIFY STANDARD METAFIELD ENABLE RETURNED NO DEFINITION:",
          {
            attribute: attributeName,
            templateId: template.id,
          }
        );

        continue;
      }

      /*
       * Auch fÃƒÂ¼r weitere Attribute derselben VerÃƒÂ¶ffentlichung
       * verfÃƒÂ¼gbar machen.
       */
      productDefinitions.push(definition);

      console.log(
        "SHOPIFY STANDARD METAFIELD ENABLED:",
        {
          attribute: attributeName,
          definitionId: definition.id,
          namespace: definition.namespace,
          key: definition.key,
          type: definition?.type?.name,
        }
      );
    }

    /*
     * Aktuell verarbeiten wir ausschlieÃƒÅ¸lich
     * Shopify-Standardfelder, die als Liste von
     * Metaobject-Referenzen gespeichert werden.
     */

    if (
      definition?.type?.name !==
      "list.metaobject_reference"
    ) {
      console.log(
        "SHOPIFY STANDARD METAFIELD TYPE NOT SUPPORTED:",
        {
          attribute:
            attributeName,

          namespace:
            definition.namespace,

          key:
            definition.key,

          type:
            definition?.type?.name,
        }
      );

      continue;
    }

    /*
     * =====================================================
     * 3. METAOBJECT-TYP ERMITTELN
     * =====================================================
     *
     * Shopify-Standardmetafields verwenden hier das
     * Schema:
     *
     * shopify.age-group
     *        -> shopify--age-group
     *
     * shopify.jewelry-type
     *        -> shopify--jewelry-type
     *
     * shopify.target-gender
     *        -> shopify--target-gender
     *
     * Color ist ein bestÃƒÂ¤tigter Sonderfall:
     *
     * shopify.color-pattern
     *        -> shopify--color-pattern
     */

    const metaobjectType =
      `shopify--${definition.key}`;

    const metaobjectIds = [];

    /*
     * =====================================================
     * 4. TAXONOMIEWERTE IN METAOBJECTS AUFLÃƒâ€“SEN
     * =====================================================
     */

    for (
      const taxonomyValue of
      attribute.values || []
    ) {
      if (!taxonomyValue?.id) {
        continue;
      }

      const metaobject =
        await findShopifyTaxonomyMetaobject(
          admin,
          metaobjectType,
          taxonomyValue.id,
          taxonomyValue.name
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
            attributeName,

          metaobjectType,

          values:
            attribute.values,
        }
      );

      continue;
    }

    /*
     * =====================================================
     * 5. SHOPIFY-METAFIELD ERZEUGEN
     * =====================================================
     */

    metafields.push({
      namespace:
        definition.namespace,

      key:
        definition.key,

      type:
        definition.type.name,

      value:
        JSON.stringify(uniqueIds),
    });

    console.log(
      "SHOPIFY TAXONOMY METAFIELD PREPARED:",
      {
        attribute:
          attributeName,

        namespace:
          definition.namespace,

        key:
          definition.key,

        metaobjectType,

        values:
          uniqueIds,
      }
    );
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
     * 2. NUR PRODUKT-ID AUS REQUEST ÃƒÅ“BERNEHMEN
     * =====================================================
     *
     * Produktdaten wie Preis, URL oder Anbieter werden
     * NICHT aus dem Browser ÃƒÂ¼bernommen.
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
     * Gleichzeitig wird geprÃƒÂ¼ft, ob das Produkt wirklich
     * dem angemeldeten Anbieter gehÃƒÂ¶rt.
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
     * 4. DOPPELTE VERÃƒâ€“FFENTLICHUNG VERHINDERN
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
     * 5. AKTIVES PAKET PRÃƒÅ“FEN
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
     * Die Domain kommt ausschlieÃƒÅ¸lich aus der
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
     * 7. ADMIN-API FÃƒÅ“R MARKTBLATT.ONLINE LADEN
     * =====================================================
     *
     * DafÃƒÂ¼r wird die bereits gespeicherte Offline-Session
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
 * ZUSÃƒâ€žTZLICHE SHOPIFY-PRODUKTDATEN
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

/*
 * =========================================================
 * ANBIETERPROFIL LADEN
 * =========================================================
 *
 * Anbieterbezogene Daten werden beim VerÃƒÂ¶ffentlichen
 * automatisch auf das Shopify-Produkt ÃƒÂ¼bertragen.
 */

const vendorProfile =
  await db.vendorProfile.findUnique({
    where: {
      customerId,
    },
  });

const vendorBackgroundImageId =
  vendorProfile?.backgroundImageId
    ? String(
        vendorProfile.backgroundImageId
      ).trim()
    : null;

const shopifyTaxonomyAttributes =
  parseShopifyTaxonomyAttributes(
    product.shopifyTaxonomyAttributes
  );

const shopifyTaxonomyMetafields =
  await prepareShopifyTaxonomyMetafields(
    admin,
    shopifyTaxonomyId,
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
     * ORIGINAL-URL PRÃƒÅ“FEN
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
               * Anbieterprodukte zunÃƒÂ¤chst immer
               * als Entwurf anlegen.
               */
              status:
                "DRAFT",

              metafields: [
...shopifyTaxonomyMetafields,

/*
 * Hintergrundbild fÃƒÂ¼r "ÃƒÅ“ber den Anbieter".
 *
 * Das Bild liegt bereits in Shopify Files.
 * Deshalb wird hier nur die MediaImage-GID
 * als file_reference gespeichert.
 */
...(vendorBackgroundImageId
  ? [
      {
        namespace:
          "custom",

        key:
          "hintergrundbild_fur_uber_den_anbieter",

        type:
          "file_reference",

        value:
          vendorBackgroundImageId,
      },
    ]
  : []),

/*
 * =========================================================
 * ANBIETERINFORMATIONEN
 * =========================================================
 */

/*
 * Informationen ÃƒÂ¼ber den Anbieter
 */
...(vendorProfile?.companyDescription
  ? [
      {
        namespace: "custom",
        key: "informationen_uber_anbieter",
        type: "multi_line_text_field",
        value: String(
          vendorProfile.companyDescription
        ),
      },
    ]
  : []),

/*
 * Rabattcode
 */
...(vendorProfile?.discountCode
  ? [
      {
        namespace: "custom",
        key: "rabattcode",
        type: "single_line_text_field",
        value: String(
          vendorProfile.discountCode
        ),
      },
    ]
  : []),

/*
 * Rabatt in %
 */
...(vendorProfile?.discountPercent != null
  ? [
      {
        namespace: "custom",
        key: "rabatt_in",
        type: "number_integer",
        value: String(
          vendorProfile.discountPercent
        ),
      },
    ]
  : []),

/*
 * Mindestbestellwert Rabattcode
 */
...(vendorProfile?.discountMinimumOrderValue
  ? [
      {
        namespace: "custom",
        key: "mindestbestellwert_rabattcode",
        type: "single_line_text_field",
        value: String(
          vendorProfile.discountMinimumOrderValue
        ),
      },
    ]
  : []),

/*
 * =========================================================
 * ANBIETER-LINKS
 * =========================================================
 *
 * Shopify-Metafelder vom Typ "link" erwarten einen
 * JSON-Wert aus URL und Beschriftung.
 */


/*
 * Link zur Homepage
 */

...(vendorProfile?.homepageUrl
  ? [
      {
        namespace: "custom",
        key: "link_zur_homepage",
        type: "link",

        value: JSON.stringify({
          url: String(
            vendorProfile.homepageUrl
          ),
          text: "Homepage",
        }),
      },
    ]
  : []),


/*
 * Link zum Impressum
 */

...(vendorProfile?.imprintUrl
  ? [
      {
        namespace: "custom",
        key: "link_zum_impressum",
        type: "link",

        value: JSON.stringify({
          url: String(
            vendorProfile.imprintUrl
          ),
          text: "Impressum",
        }),
      },
    ]
  : []),


/*
 * Widerruf / RÃ¼ckgabe
 */

...(vendorProfile?.withdrawalUrl
  ? [
      {
        namespace: "custom",
        key: "info_zu_widerruf_ruckgabe",
        type: "link",

        value: JSON.stringify({
          url: String(
            vendorProfile.withdrawalUrl
          ),
          text: "Widerruf / Rückgabe",
        }),
      },
    ]
  : []),


/*
 * Facebook
 */

...(vendorProfile?.facebookUrl
  ? [
      {
        namespace: "custom",
        key: "facebook",
        type: "link",

        value: JSON.stringify({
          url: String(
            vendorProfile.facebookUrl
          ),
          text: "Facebook",
        }),
      },
    ]
  : []),


/*
 * Instagram
 */

...(vendorProfile?.instagramUrl
  ? [
      {
        namespace: "custom",
        key: "instagram_link",
        type: "link",

        value: JSON.stringify({
          url: String(
            vendorProfile.instagramUrl
          ),
          text: "Instagram",
        }),
      },
    ]
  : []),


/*
 * TikTok
 */

...(vendorProfile?.tiktokUrl
  ? [
      {
        namespace: "custom",
        key: "tiktok_link",
        type: "link",

        value: JSON.stringify({
          url: String(
            vendorProfile.tiktokUrl
          ),
          text: "TikTok",
        }),
      },
    ]
  : []),


/*
 * YouTube
 */

...(vendorProfile?.youtubeUrl
  ? [
      {
        namespace: "custom",
        key: "youtube_link",
        type: "link",

        value: JSON.stringify({
          url: String(
            vendorProfile.youtubeUrl
          ),
          text: "YouTube",
        }),
      },
    ]
  : []),

/*
 * =========================================================
 * PRODUKT-LINK / LIEFERZEIT
 * =========================================================
 */

/*
 * Original-Produktseite beim Anbieter
 *
 * Shopify-Metafeld:
 * custom.external_url
 * Typ: URL
 */
{
  namespace: "custom",
  key: "external_url",
  type: "url",
  value: sourceUrl,
},

/*
 * Allgemeine Lieferzeit des Anbieters
 *
 * Shopify-Metafeld:
 * custom.info_zur_lieferzeit
 * Typ: Mehrzeiliger Text
 */
...(vendorProfile?.deliveryTimeInfo
  ? [
      {
        namespace: "custom",
        key: "info_zur_lieferzeit",
        type: "multi_line_text_field",
        value: String(
          vendorProfile.deliveryTimeInfo
        ),
      },
    ]
  : []),
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
     * 10. GRAPHQL-FEHLER PRÃƒÅ“FEN
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
          "Produkt wurde als Entwurf an Marktblatt übertragen.",

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
 * CORS-UnterstÃƒÂ¼tzung fÃƒÂ¼r die Shopify
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
