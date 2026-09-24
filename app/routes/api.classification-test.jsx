import {
  classifyProduct,
} from "../classification.server";

import {
  findShopifyTaxonomy,
} from "../taxonomy.server";


export const loader = async () => {
  try {
    /*
     * =====================================================
     * FESTES TESTPRODUKT
     * =====================================================
     */

    const product = {
      title:
        "Kordelarmband 18K Gold Damen",

      category:
        "Armbänder",

      productType:
        null,

      description:
        "18K vergoldetes Kordelarmband aus Edelstahl mit 6 mm Breite. Verstellbar von 18 bis 23 cm, wasserfest und mit Anlaufschutz.",
    };


    /*
     * =====================================================
     * 1. KI-KLASSIFIZIERUNG EINZELN TESTEN
     * =====================================================
     */

    const classification =
      await classifyProduct(
        product
      );


    /*
     * =====================================================
     * 2. KOMPLETTE TAXONOMIE-KETTE TESTEN
     * =====================================================
     *
     * findShopifyTaxonomy() führt intern ebenfalls die
     * KI-Klassifizierung aus und sucht anschließend
     * ausschließlich in der echten Shopify-Taxonomie.
     */

    const taxonomy =
      await findShopifyTaxonomy(
        product
      );


    return Response.json({
      success: true,

      product: {
        title:
          product.title,

        category:
          product.category,
      },

      classification,

      taxonomy,
    });

  } catch (error) {
    console.error(
      "CLASSIFICATION TAXONOMY TEST ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Klassifizierungs- und Taxonomietest fehlgeschlagen.",
      },
      {
        status: 500,
      }
    );
  }
};