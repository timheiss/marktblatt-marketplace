import {
  unauthenticated,
} from "../shopify.server";

export async function loader() {
  try {
    const shop =
      process.env.MARKTBLATT_SHOP;

    if (!shop) {
      throw new Error(
        "MARKTBLATT_SHOP fehlt."
      );
    }

    const { admin } =
      await unauthenticated.admin(
        shop
      );

    const response =
      await admin.graphql(
        `#graphql
        query {
          inclusion:
            __type(
              name:
                "CollectionCreateSourceInclusionInput"
            ) {
              name

              inputFields {
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

          inclusionCondition:
            __type(
              name:
                "CollectionSourceInclusionConditionInput"
            ) {
              name

              inputFields {
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

          vendorRelation:
            __type(
              name:
                "CollectionSourceInclusionConditionProductVendorRelation"
            ) {
              name

              enumValues {
                name
              }
            }

          matchType:
            __type(
              name:
                "CollectionConditionMatchType"
            ) {
              name

              enumValues {
                name
              }
            }
        }
        `
      );

    const result =
      await response.json();

    return Response.json(
      result
    );

  } catch (error) {
    console.error(
      "COLLECTION INTROSPECTION ERROR:",
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