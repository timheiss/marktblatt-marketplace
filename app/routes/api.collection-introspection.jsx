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
          collectionCreateInput:
            __type(
              name: "CollectionCreateInput"
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

          collectionSourceInput:
            __type(
              name: "CollectionSourceInput"
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

          conditionInput:
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
