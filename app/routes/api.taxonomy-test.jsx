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
      query CategoryMetafieldDefinitions {
        metafieldDefinitions(
          ownerType: PRODUCT
          first: 100
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
    `
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
 * SHOPIFY STANDARD-METAOBJECT-DEFINITION: FABRIC
 * =========================================================
 *
 * Nur lesen.
 * Damit ermitteln wir die exakten Felder, die Shopify
 * für shopify--fabric verwendet.
 */

const metaobjectDefinitionResponse =
  await admin.graphql(
    `#graphql
      query FabricMetaobjectDefinition {
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
      }
    `
  );

const metaobjectDefinitionResult =
  await metaobjectDefinitionResponse.json();

if (
  metaobjectDefinitionResult
    ?.errors
    ?.length
) {
  console.error(
    "SHOPIFY METAOBJECT DEFINITION ERRORS:",
    metaobjectDefinitionResult.errors
  );

  return Response.json(
    {
      success: false,
      stage:
        "metaobjectDefinitionByType",
      errors:
        metaobjectDefinitionResult.errors,
    },
    {
      status: 500,
    }
  );
}

const fabricMetaobjectDefinition =
  metaobjectDefinitionResult
    ?.data
    ?.metaobjectDefinitionByType ||
  null;

    console.log(
      "SHOPIFY BRACELETS ATTRIBUTES:",
      JSON.stringify(
        bracelets,
        null,
        2
      )
    );


return Response.json({
  success: true,
  category: bracelets,
  metafieldDefinitions,
  fabricMetaobjectDefinition,
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