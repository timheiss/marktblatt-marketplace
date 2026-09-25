import {
  getShopifyTaxonomyAttributes,
} from "../taxonomy.server";

import {
  classifyProductAttributes,
} from "../attribute-classification.server";


export const loader = async () => {
  try {
    /*
     * =====================================================
     * ECHTES FE-HO TESTPRODUKT
     * =====================================================
     */

    const product = {
      title:
        "Armband | 18K Gold - Kordelkette - B 6mm - L 18+5cm - Damen",

      category:
        "Armbänder",

      productType:
        null,

      description:
        "18K vergoldetes Kordelarmband aus Edelstahl mit 6 mm Breite. Verstellbar von 18 bis 23 cm, wasserfest und mit Anlaufschutz.",
    };


    /*
     * Bereits bestätigte Shopify-Kategorie:
     *
     * Apparel & Accessories > Jewelry > Bracelets
     */

    const taxonomyId =
      "gid://shopify/TaxonomyCategory/aa-6-3";


    /*
     * =====================================================
     * OFFIZIELLE SHOPIFY-ATTRIBUTE LADEN
     * =====================================================
     */

    const taxonomy =
      await getShopifyTaxonomyAttributes(
        taxonomyId
      );

    if (!taxonomy) {
      throw new Error(
        "Shopify-Taxonomie konnte nicht geladen werden."
      );
    }


    /*
     * =====================================================
     * KI DARF NUR AUS SHOPIFY-WERTEN AUSWÄHLEN
     * =====================================================
     */

    const attributes =
      await classifyProductAttributes(
        product,
        taxonomy
      );


    console.log(
      "ATTRIBUTE CLASSIFICATION TEST:",
      JSON.stringify(
        {
          product,
          taxonomy: {
            id: taxonomy.id,
            name: taxonomy.name,
            fullName: taxonomy.fullName,
          },
          attributes,
        },
        null,
        2
      )
    );


    return Response.json({
      success: true,

      product: {
        title: product.title,
        category: product.category,
      },

      taxonomy: {
        id: taxonomy.id,
        name: taxonomy.name,
        fullName: taxonomy.fullName,
      },

      attributes,
    });

  } catch (error) {
    console.error(
      "ATTRIBUTE CLASSIFICATION TEST ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Attributklassifizierung fehlgeschlagen.",
      },
      {
        status: 500,
      }
    );
  }
};