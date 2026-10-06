import {
  unauthenticated,
} from "../shopify.server";

/*
 * =========================================================
 * MARKTBLATT COLLECTION SYNC
 * =========================================================
 *
 * TESTPHASE:
 *
 * Es wird zunächst ausschließlich die automatische
 * Shopify-Kollektion "Ohrringe" angelegt.
 *
 * Bedingung:
 *
 * Produkt besitzt den Tag:
 * mb:subcategory:earrings
 *
 * WICHTIG:
 *
 * Vor dem Erstellen wird geprüft, ob bereits eine
 * Marktblatt-Kollektion mit diesem Handle existiert.
 */

const TEST_COLLECTION = {
  title: "Ohrringe",
  handle: "ohrringe",
  tag: "mb:subcategory:earrings",
};


/*
 * =========================================================
 * COLLECTION NACH HANDLE SUCHEN
 * =========================================================
 */

async function findCollectionByHandle(
  admin,
  handle
) {
  const response =
    await admin.graphql(
      `#graphql
      query FindMarktblattCollection(
        $query: String!
      ) {
        collections(
          first: 10
          query: $query
        ) {
          nodes {
            id
            title
            handle
          }
        }
      }
      `,
      {
        variables: {
          query:
            `handle:${handle}`,
        },
      }
    );

  const result =
    await response.json();

  if (result?.errors?.length) {
    throw new Error(
      result.errors
        .map(
          (error) =>
            error.message
        )
        .join(", ")
    );
  }

  return (
    result?.data
      ?.collections
      ?.nodes || []
  ).find(
    (collection) =>
      collection.handle ===
      handle
  ) || null;
}


/*
 * =========================================================
 * AUTOMATISCHE COLLECTION ERSTELLEN
 * =========================================================
 */

async function createTagCollection(
  admin,
  {
    title,
    handle,
    tag,
  }
) {
  const response =
    await admin.graphql(
      `#graphql
      mutation CreateMarktblattCollection(
        $collection: CollectionCreateInput!
      ) {
        collectionCreate(
          collection: $collection
        ) {
          collection {
            id
            title
            handle

            sources {
              __typename
              id
              title

              ... on CollectionConditionsSource {
                inclusion {
                  matchType

                  conditions {
                    __typename

                    ... on CollectionSourceInclusionConditionProductTag {
                      relation
                      values
                      matchType
                    }
                  }
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
          collection: {
            title,
            handle,

            sources: [
              {
                source: {
                  title:
                    `Marktblatt: ${title}`,

                  inclusion: {
                    matchType:
                      "ALL",

                    conditions: [
                      {
                        productTag: {
                          relation:
                            "TAGGED_WITH",

                          values: [
                            tag,
                          ],

                          matchType:
                            "ANY",
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      }
    );

  const result =
    await response.json();

  if (result?.errors?.length) {
    console.error(
      "MARKTBLATT COLLECTION GRAPHQL ERRORS:",
      result.errors
    );

    throw new Error(
      result.errors
        .map(
          (error) =>
            error.message
        )
        .join(", ")
    );
  }

  const payload =
    result?.data
      ?.collectionCreate;

  const userErrors =
    payload?.userErrors || [];

  if (userErrors.length) {
    console.error(
      "MARKTBLATT COLLECTION USER ERRORS:",
      userErrors
    );

    throw new Error(
      userErrors
        .map(
          (error) =>
            error.message
        )
        .join(", ")
    );
  }

  if (!payload?.collection) {
    throw new Error(
      "Shopify hat keine Collection zurückgegeben."
    );
  }

  return payload.collection;
}


/*
 * =========================================================
 * ROUTE
 * =========================================================
 */

export async function loader() {
  try {
    const shop =
      process.env.MARKTBLATT_SHOP;

    if (!shop) {
      throw new Error(
        "MARKTBLATT_SHOP fehlt."
      );
    }

    if (
      !shop.endsWith(
        ".myshopify.com"
      )
    ) {
      throw new Error(
        "MARKTBLATT_SHOP enthält keine gültige Shopify-Shop-Domain."
      );
    }


    /*
     * Marktblatt-Shop Admin API laden.
     */

    const { admin } =
      await unauthenticated.admin(
        shop
      );


    /*
     * =====================================================
     * DUPLIKATSCHUTZ
     * =====================================================
     */

    const existingCollection =
      await findCollectionByHandle(
        admin,
        TEST_COLLECTION.handle
      );

    if (existingCollection) {
      console.log(
        "MARKTBLATT COLLECTION ALREADY EXISTS:",
        existingCollection
      );

      return Response.json({
        success: true,
        action: "existing",

        collection:
          existingCollection,

        expectedTag:
          TEST_COLLECTION.tag,
      });
    }


    /*
     * =====================================================
     * COLLECTION ERSTELLEN
     * =====================================================
     */

    const collection =
      await createTagCollection(
        admin,
        TEST_COLLECTION
      );

    console.log(
      "MARKTBLATT COLLECTION CREATED:",
      {
        id:
          collection.id,

        title:
          collection.title,

        handle:
          collection.handle,

        tag:
          TEST_COLLECTION.tag,

        sources:
          collection.sources,
      }
    );


    return Response.json({
      success: true,
      action: "created",

      collection,

      expectedTag:
        TEST_COLLECTION.tag,
    });

  } catch (error) {
    console.error(
      "MARKTBLATT COLLECTION SYNC ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error?.message ||
          "Unbekannter Fehler",
      },
      {
        status: 500,
      }
    );
  }
}