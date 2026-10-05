import {
  unauthenticated,
} from "../shopify.server";


export async function loader() {
  try {
    const marktblattShop =
      process.env.MARKTBLATT_SHOP;

    if (!marktblattShop) {
      throw new Error(
        "MARKTBLATT_SHOP fehlt."
      );
    }

    const { admin } =
      await unauthenticated.admin(
        marktblattShop
      );


    const response =
      await admin.graphql(
        `#graphql
          query GoogleVariantMetafieldDefinitions {
            metafieldDefinitions(
              first: 250
              ownerType: PRODUCTVARIANT
            ) {
              nodes {
                id
                name
                namespace
                key
                type {
                  name
                }
              }
            }
          }
        `
      );


    const result =
      await response.json();


    if (result?.errors?.length) {
      return Response.json(
        {
          success: false,
          errors:
            result.errors,
        },
        {
          status: 500,
        }
      );
    }


    const definitions =
      result?.data
        ?.metafieldDefinitions
        ?.nodes || [];


    /*
     * Nur Google-relevante Definitionen ausgeben.
     */

    const googleDefinitions =
      definitions.filter(
        (definition) => {
          const searchText =
            [
              definition?.name,
              definition?.namespace,
              definition?.key,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

          return (
            searchText.includes(
              "google"
            ) ||
            searchText.includes(
              "age group"
            ) ||
            searchText.includes(
              "age_group"
            ) ||
            searchText.includes(
              "condition"
            ) ||
            searchText.includes(
              "gender"
            ) ||
            searchText.includes(
              "mpn"
            )
          );
        }
      );


    console.log(
      "GOOGLE VARIANT METAFIELD DEFINITIONS:",
      googleDefinitions
    );


    return Response.json({
      success: true,

      count:
        googleDefinitions.length,

      definitions:
        googleDefinitions,
    });

  } catch (error) {
    console.error(
      "GOOGLE VARIANT METAFIELD TEST ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}
