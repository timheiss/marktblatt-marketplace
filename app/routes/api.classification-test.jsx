import {
  classifyProduct,
  classifyProductSearchTerms,
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
    "Scrunchie | Classic - Haargummi - versch. Farben - FE-HO",

  category:
    null,

  productType:
    null,

  description:
    "Elegantes Satin-Scrunchie mit 60 mm Durchmesser. Haarschonend, elastisch und als Haaraccessoire für Damen geeignet.",
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

const searchTerms =
  await classifyProductSearchTerms(
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
searchTerms,

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