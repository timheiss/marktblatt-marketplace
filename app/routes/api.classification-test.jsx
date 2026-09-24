import {
  classifyProduct,
} from "../classification.server";


export const loader = async () => {
  try {
    /*
     * =====================================================
     * FESTES TESTPRODUKT
     * =====================================================
     *
     * Noch keine Verbindung zum echten Scraper.
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
     * KI-KLASSIFIZIERUNG
     */

    const classification =
      await classifyProduct(
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
    });

  } catch (error) {
    console.error(
      "CLASSIFICATION TEST ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Klassifizierung fehlgeschlagen.",
      },
      {
        status: 500,
      }
    );
  }
};