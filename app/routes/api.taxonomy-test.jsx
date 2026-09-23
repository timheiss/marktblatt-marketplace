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

    const response =
      await admin.graphql(
        `#graphql
          query TaxonomySearch {
            taxonomy {
              categories(
                first: 20
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

    console.log(
      "SHOPIFY TAXONOMY TEST:",
      JSON.stringify(
        result,
        null,
        2
      )
    );

    return Response.json(result);

  } catch (error) {
    console.error(
      "SHOPIFY TAXONOMY TEST ERROR:",
      error
    );

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Taxonomie konnte nicht geladen werden.",
      },
      {
        status: 500,
      }
    );
  }
};