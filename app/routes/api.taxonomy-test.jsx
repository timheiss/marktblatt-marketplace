import {
  unauthenticated,
} from "../shopify.server";


export const loader = async () => {
  try {
    const marktblattShop =
      process.env.MARKTBLATT_SHOP;

    if (!marktblattShop) {
      throw new Error(
        "MARKTBLATT_SHOP ist nicht konfiguriert."
      );
    }

    const { admin } =
      await unauthenticated.admin(
        marktblattShop
      );


    /*
     * =====================================================
     * SHOPIFY TAXONOMIE-KATEGORIE TESTEN
     * =====================================================
     *
     * Bereits bestätigte Kategorie:
     *
     * Bracelets
     * gid://shopify/TaxonomyCategory/aa-6-3
     */

    const response =
      await admin.graphql(
        `#graphql
          query TaxonomyAttributeTest {
            taxonomy {
              categories(
                first: 10
                search: "Bracelets"
              ) {
                nodes {
                  id
                  name
                  fullName
                  isLeaf

                  attributes(first: 50) {
                    nodes {
                      __typename

                      ... on TaxonomyAttribute {
                        id
                      }

                      ... on TaxonomyChoiceListAttribute {
                        id
                        name

                        values(first: 100) {
                          nodes {
                            id
                            name
                          }
                        }
                      }

                      ... on TaxonomyMeasurementAttribute {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        `
      );

    const result =
      await response.json();


    /*
     * =====================================================
     * GRAPHQL-FEHLER
     * =====================================================
     */

    if (result?.errors?.length) {
      console.error(
        "SHOPIFY TAXONOMY ATTRIBUTE ERRORS:",
        result.errors
      );

      return Response.json(
        {
          success: false,
          errors: result.errors,
        },
        {
          status: 500,
        }
      );
    }


    /*
     * =====================================================
     * NUR BRACELETS AUSWÄHLEN
     * =====================================================
     */

    const categories =
      result?.data
        ?.taxonomy
        ?.categories
        ?.nodes || [];

    const bracelets =
      categories.find(
        (category) =>
          category.id ===
          "gid://shopify/TaxonomyCategory/aa-6-3"
      ) || null;

/*
 * =========================================================
 * SHOPIFY CATEGORY-METAFIELD-DEFINITIONEN
 * =========================================================
 *
 * Nur lesen - es wird nichts in Shopify verändert.
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
            "gid://shopify/TaxonomyCategory/aa-6-3",
        },
      },
    }
  );

const definitionsResult =
  await definitionsResponse.json();

if (definitionsResult?.errors?.length) {
  console.error(
    "SHOPIFY METAFIELD DEFINITION ERRORS:",
    definitionsResult.errors
  );

  return Response.json(
    {
      success: false,
      stage: "metafieldDefinitions",
      errors: definitionsResult.errors,
    },
    {
      status: 500,
    }
  );
}

const metafieldDefinitions =
  definitionsResult?.data
    ?.metafieldDefinitions
    ?.nodes || [];

/*
 * =========================================================
 * SHOPIFY STANDARD-METAFIELD-TEMPLATES
 * =========================================================
 *
 * Nur lesen.
 *
 * Damit prüfen wir, welche offiziellen Shopify-
 * Standarddefinitionen für Produkte verfügbar sind.
 */

const standardDefinitionsResponse =
  await admin.graphql(
    `#graphql
      query StandardMetafieldDefinitions(
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
            description
            ownerTypes

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
            "gid://shopify/TaxonomyCategory/aa-6-8",
        },
      },
    }
  );

const standardDefinitionsResult =
  await standardDefinitionsResponse.json();

if (
  standardDefinitionsResult
    ?.errors
    ?.length
) {
  console.error(
    "SHOPIFY STANDARD METAFIELD TEMPLATE ERRORS:",
    standardDefinitionsResult.errors
  );

  return Response.json(
    {
      success: false,
      stage:
        "standardMetafieldDefinitionTemplates",
      errors:
        standardDefinitionsResult.errors,
    },
    {
      status: 500,
    }
  );
}

const standardMetafieldDefinitions =
  standardDefinitionsResult
    ?.data
    ?.standardMetafieldDefinitionTemplates
    ?.nodes || [];

/*
 * =========================================================
 * SHOPIFY STANDARD-METAOBJECT-DEFINITIONEN
 * =========================================================
 *
 * Nur lesen.
 *
 * Wir prüfen die drei bereits bestätigten
 * Shopify-Kategorie-Metafields:
 *
 * Color         -> shopify--color-pattern
 * Target gender -> shopify--target-gender
 * Fabric        -> shopify--fabric
 */

const metaobjectDefinitionsResponse =
  await admin.graphql(
    `#graphql
      query ShopifyCategoryMetaobjectDefinitions {

        colorPattern:
          metaobjectDefinitionByType(
            type: "shopify--color-pattern"
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

        targetGender:
          metaobjectDefinitionByType(
            type: "shopify--target-gender"
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

        fabric:
          metaobjectDefinitionByType(
            type: "shopify--fabric"
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
ageGroup:
  metaobjectDefinitionByType(
    type: "shopify--age-group"
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

jewelryType:
  metaobjectDefinitionByType(
    type: "shopify--jewelry-type"
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
    `
  );

const metaobjectDefinitionsResult =
  await metaobjectDefinitionsResponse.json();

if (
  metaobjectDefinitionsResult
    ?.errors
    ?.length
) {
  console.error(
    "SHOPIFY METAOBJECT DEFINITION ERRORS:",
    metaobjectDefinitionsResult.errors
  );

  return Response.json(
    {
      success: false,
      stage:
        "metaobjectDefinitionByType",
      errors:
        metaobjectDefinitionsResult.errors,
    },
    {
      status: 500,
    }
  );
}

const categoryMetaobjectDefinitions = {
  colorPattern:
    metaobjectDefinitionsResult
      ?.data
      ?.colorPattern ||
    null,

  targetGender:
    metaobjectDefinitionsResult
      ?.data
      ?.targetGender ||
    null,

  fabric:
    metaobjectDefinitionsResult
      ?.data
      ?.fabric ||
    null,
ageGroup:
  metaobjectDefinitionsResult
    ?.data
    ?.ageGroup ||
  null,

jewelryType:
  metaobjectDefinitionsResult
    ?.data
    ?.jewelryType ||
  null,
};

/*
 * =========================================================
 * VORHANDENE SHOPIFY COLOR-PATTERN METAOBJECTS
 * =========================================================
 *
 * Nur lesen.
 *
 * Damit sehen wir die tatsächliche Struktur bereits
 * vorhandener Shopify-Farb-/Muster-Metaobjects.
 */

const colorPatternMetaobjectsResponse =
  await admin.graphql(
    `#graphql
      query ShopifyColorPatternMetaobjects {
        metaobjects(
          type: "shopify--color-pattern"
          first: 50
        ) {
          nodes {
            id
            handle
            type
            displayName

            fields {
              key
              value
              type
            }
          }
        }
      }
    `
  );

const colorPatternMetaobjectsResult =
  await colorPatternMetaobjectsResponse.json();

if (
  colorPatternMetaobjectsResult
    ?.errors
    ?.length
) {
  console.error(
    "SHOPIFY COLOR PATTERN METAOBJECT ERRORS:",
    colorPatternMetaobjectsResult.errors
  );

  return Response.json(
    {
      success: false,
      stage:
        "colorPatternMetaobjects",
      errors:
        colorPatternMetaobjectsResult.errors,
    },
    {
      status: 500,
    }
  );
}

const colorPatternMetaobjects =
  colorPatternMetaobjectsResult
    ?.data
    ?.metaobjects
    ?.nodes || [];

    console.log(
      "SHOPIFY BRACELETS ATTRIBUTES:",
      JSON.stringify(
        bracelets,
        null,
        2
      )
    );

/*
 * =========================================================
 * GRAPHQL MUTATION SCHEMA PRÜFEN
 * =========================================================
 *
 * Nur lesen.
 * Prüft, ob Shopify
 * standardMetafieldDefinitionEnable unterstützt
 * und welche Argumente die Mutation erwartet.
 */

const mutationSchemaResponse =
  await admin.graphql(
    `#graphql
      query StandardMetafieldDefinitionEnableSchema {
        __type(name: "Mutation") {
          fields {
            name

            args {
              name

              type {
                kind
                name

                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    `
  );

const mutationSchemaResult =
  await mutationSchemaResponse.json();

if (mutationSchemaResult?.errors?.length) {
  console.error(
    "SHOPIFY MUTATION SCHEMA ERRORS:",
    mutationSchemaResult.errors
  );

  return Response.json(
    {
      success: false,
      stage: "mutationSchema",
      errors: mutationSchemaResult.errors,
    },
    {
      status: 500,
    }
  );
}

const standardMetafieldDefinitionEnableMutation =
  mutationSchemaResult?.data
    ?.__type
    ?.fields
    ?.find(
      (field) =>
        field.name ===
        "standardMetafieldDefinitionEnable"
    ) || null;

/*
 * =========================================================
 * STANDARD METAFIELD ENABLE PAYLOAD PRÜFEN
 * =========================================================
 *
 * Nur Introspection.
 * Es wird nichts in Shopify verändert.
 */

const enablePayloadResponse =
  await admin.graphql(
    `#graphql
      query StandardMetafieldDefinitionEnablePayload {
        __type(
          name: "StandardMetafieldDefinitionEnablePayload"
        ) {
          name

          fields {
            name

            type {
              kind
              name

              ofType {
                kind
                name

                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    `
  );

const enablePayloadResult =
  await enablePayloadResponse.json();

const standardMetafieldDefinitionEnablePayload =
  enablePayloadResult?.data?.__type || null;

/*
 * =========================================================
 * TEST: JEWELRY MATERIAL STANDARDDEFINITION AKTIVIEREN
 * =========================================================
 *
 * Aktiviert ausschließlich Shopifys offizielle
 * Standard-Metafelddefinition "Jewelry material".
 */

const enableJewelryMaterialResponse =
  await admin.graphql(
    `#graphql
      mutation EnableJewelryMaterial {
        standardMetafieldDefinitionEnable(
          ownerType: PRODUCT
          id: "gid://shopify/StandardMetafieldDefinitionTemplate/12781"
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
    `
  );

const enableJewelryMaterialResult =
  await enableJewelryMaterialResponse.json();

if (enableJewelryMaterialResult?.errors?.length) {
  console.error(
    "SHOPIFY JEWELRY MATERIAL ENABLE GRAPHQL ERRORS:",
    enableJewelryMaterialResult.errors
  );

  return Response.json(
    {
      success: false,
      stage: "enableJewelryMaterial",
      errors: enableJewelryMaterialResult.errors,
    },
    {
      status: 500,
    }
  );
}

const jewelryMaterialEnable =
  enableJewelryMaterialResult?.data
    ?.standardMetafieldDefinitionEnable || null;

return Response.json({
  success: true,
  category: bracelets,
  metafieldDefinitions,
  standardMetafieldDefinitions,
  categoryMetaobjectDefinitions,
  colorPatternMetaobjects,
  standardMetafieldDefinitionEnableMutation,
  standardMetafieldDefinitionEnablePayload,
  jewelryMaterialEnable,
});

  } catch (error) {
    console.error(
      "SHOPIFY TAXONOMY ATTRIBUTE TEST ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Taxonomieattribute konnten nicht geladen werden.",
      },
      {
        status: 500,
      }
    );
  }
};