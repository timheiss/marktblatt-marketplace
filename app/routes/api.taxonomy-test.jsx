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
     * TESTPRODUKT OHNE KATEGORIE ERSTELLEN
     * =====================================================
     */

    const createResponse =
      await admin.graphql(
        `#graphql
          mutation TaxonomySuggestionTest {
            productCreate(
              product: {
                title: "Kordelarmband 18K Gold Damen"
                descriptionHtml: """
                  <p>
                    18K vergoldetes Kordelarmband aus Edelstahl
                    mit 6 mm Breite. Verstellbar von 18 bis 23 cm,
                    wasserfest und mit Anlaufschutz.
                  </p>
                """
                vendor: "Marktblatt Taxonomy Test"
                status: DRAFT
              }
            ) {
              product {
                id
                title
                status

                category {
                  id
                  name
                  fullName
                }
              }

              userErrors {
                field
                message
              }
            }
          }
        `
      );

    const createResult =
      await createResponse.json();


    /*
     * GRAPHQL-FEHLER
     */

    if (createResult?.errors?.length) {
      return Response.json(
        {
          success: false,
          stage: "productCreate",
          errors:
            createResult.errors,
        },
        {
          status: 500,
        }
      );
    }


    const userErrors =
      createResult?.data
        ?.productCreate
        ?.userErrors || [];

    if (userErrors.length) {
      return Response.json(
        {
          success: false,
          stage: "productCreate",
          userErrors,
        },
        {
          status: 400,
        }
      );
    }


    const product =
      createResult?.data
        ?.productCreate
        ?.product;

    if (!product?.id) {
      throw new Error(
        "Shopify hat kein Testprodukt zurückgegeben."
      );
    }


    /*
     * =====================================================
     * PRODUKT DIREKT NOCH EINMAL ABFRAGEN
     * =====================================================
     */

    const checkResponse =
      await admin.graphql(
        `#graphql
          query CheckTaxonomySuggestion(
            $id: ID!
          ) {
            product(id: $id) {
              id
              title
              status

              category {
                id
                name
                fullName
              }
            }
          }
        `,
        {
          variables: {
            id: product.id,
          },
        }
      );

    const checkResult =
      await checkResponse.json();


    console.log(
      "SHOPIFY CATEGORY SUGGESTION TEST:",
      JSON.stringify(
        checkResult,
        null,
        2
      )
    );


    return Response.json({
      success: true,

      /*
       * Das Produkt bleibt absichtlich als DRAFT bestehen.
       * So können wir es zusätzlich im Shopify-Admin prüfen.
       */

      createdProduct:
        product,

      checkedProduct:
        checkResult?.data?.product ||
        null,

      instruction:
        "Das DRAFT-Testprodukt im Shopify-Admin öffnen und prüfen, ob Shopify bei Kategorie einen Vorschlag anzeigt.",
    });

  } catch (error) {
    console.error(
      "SHOPIFY CATEGORY SUGGESTION TEST ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Test konnte nicht durchgeführt werden.",
      },
      {
        status: 500,
      }
    );
  }
};