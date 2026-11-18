import db from "../db.server";
import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";
import { authenticate } from "../shopify.server";
import {
  getVerifiedVendorShop,
  assertVerifiedShopDomain,
} from "../services/vendor-shop-domain.server";
import { secureDownloadHtml } from "../services/secure-product-fetch.server";
import { extractProduct } from "../services/product-extraction.server";


/*
 * =========================================================
 * TEXT BEREINIGEN
 * =========================================================
 */

export async function action({
  request,
}) {
  
  let cors = (response) => response;

  try {
    const auth = await authenticate.public.customerAccount(request);
    cors = auth.cors;

    const customerId = auth.sessionToken?.sub;

    if (!customerId) {
      return cors(
        Response.json(
          {
            success: false,
            error: "Nicht angemeldet.",
          },
          { status: 401 }
        )
      );
    }

/*
 * =========================================================
 * MARKTBLATT-PAKETBERECHTIGUNG PRÜFEN
 * =========================================================
 */

const subscription = await db.subscription.findUnique({
  where: {
    customerId,
  },
});

if (
  !subscription ||
  subscription.status !== "active"
) {
  return cors(
    Response.json(
      {
        success: false,
        error: "Für den Produktimport ist ein aktives Marktblatt-Paket erforderlich.",
      },
      { status: 403 }
    )
  );
}

if (
  !Number.isInteger(subscription.productLimit) ||
  subscription.productLimit < 1
) {
  return cors(
    Response.json(
      {
        success: false,
        error: "Für dieses Paket ist kein gültiges Produktlimit hinterlegt.",
      },
      { status: 403 }
    )
  );
}

const verifiedShop = await getVerifiedVendorShop(customerId);

const body = await request.json();
const productUrl = body?.url;

if (!productUrl || typeof productUrl !== "string") {
  return cors(
    Response.json(
      {
        success: false,
        error: "Bitte geben Sie eine Produkt-URL ein.",
      },
      { status: 400 }
    )
  );
}

// Nur URLs des verifizierten Onlineshops zulassen.
assertVerifiedShopDomain(
  productUrl,
  verifiedShop.shopUrl
);

/*
 * PRODUKTSEITE LADEN
 */

    const {
      html,
      finalUrl,
    } =
await secureDownloadHtml(
  productUrl,
  verifiedShop.shopUrl
);

    /*
     * PRODUKT AUSLESEN
     */

const product =
  extractProduct(
    html,
    finalUrl
  );

/*
 * =========================================================
 * SEO-DATEN PRÜFEN UND OPTIMIEREN
 * =========================================================
 *
 * Vorhandene Meta-Daten werden von der KI auf Qualität
 * geprüft.
 *
 * Fehlende oder unzureichende SEO-Daten werden aus den
 * tatsächlichen Produktinformationen verbessert.
 *
 * Die SEO-Optimierung besitzt zusätzlich einen lokalen
 * Fallback und darf den Produktimport niemals verhindern.
 */

try {
  const {
    optimizeProductSeo,
  } = await import(
    "../seo-optimization.server"
  );

  const optimizedSeo =
    await optimizeProductSeo({
      title:
        product.title,

      description:
        product.description,

      metaTitle:
        product.metaTitle,

      metaDescription:
        product.metaDescription,
    });

  product.metaTitle =
    optimizedSeo?.metaTitle ||
    product.metaTitle ||
    null;

  product.metaDescription =
    optimizedSeo?.metaDescription ||
    product.metaDescription ||
    null;

  console.log(
    "SCRAPER SEO RESULT:",
    {
      metaTitle:
        product.metaTitle,

      metaDescription:
        product.metaDescription,

      optimizedByAi:
        optimizedSeo
          ?.optimizedByAi ??
        false,
    }
  );

} catch (error) {
  /*
   * Zusätzliche Sicherheitsstufe:
   *
   * Selbst ein unerwarteter Fehler beim Laden des
   * SEO-Moduls darf den Produktimport nicht verhindern.
   */

  console.error(
    "SCRAPER SEO OPTIMIZATION ERROR:",
    error
  );
}

/*
 * =========================================================
 * ANBIETERINFORMATIONEN ERMITTELN
 * =========================================================
 */

const vendorLinks =
  extractVendorLinks(
    html,
    finalUrl
  );

product.vendorLinks =
  vendorLinks;

console.log(
  "SCRAPER VENDOR LINKS:",
  {
    sourceUrl:
      product.sourceUrl,

    ...vendorLinks,
  }
);

/*
 * =========================================================
 * SHOPIFY TAXONOMIE ERKENNEN
 * =========================================================
 *
 * Die Taxonomie wird zunächst nur ermittelt und mit den
 * Produktdaten zurückgegeben.
 *
 * Noch keine Änderung am Shopify-Produkt.
 */

const {
  findShopifyTaxonomy,
} = await import(
  "../taxonomy.server"
);

const taxonomy =
  await findShopifyTaxonomy(
    product
  );

product.shopifyTaxonomyId =
  taxonomy?.id || null;

product.shopifyTaxonomyName =
  taxonomy?.name || null;

/*
 * =========================================================
 * SHOPIFY TAXONOMIE-ATTRIBUTE ERKENNEN
 * =========================================================
 *
 * Nachdem die Produktkategorie feststeht, werden die
 * offiziellen Attribute und erlaubten Werte dieser
 * Shopify-Kategorie geladen.
 *
 * Die KI darf anschließend ausschließlich aus diesen
 * Shopify-Werten auswählen.
 */

product.shopifyTaxonomyAttributes = [];

if (
  taxonomy?.id &&
  taxonomy?.name
) {
  try {
    const {
      getShopifyTaxonomyAttributes,
    } = await import(
      "../taxonomy.server"
    );

    const {
      classifyProductAttributes,
    } = await import(
      "../attribute-classification.server"
    );


    /*
     * Offizielle Attribute und Werte für die
     * erkannte Shopify-Kategorie laden.
     */

    const taxonomyWithAttributes =
      await getShopifyTaxonomyAttributes(
        taxonomy.id,
        taxonomy.name
      );


    /*
     * Passende Werte anhand der tatsächlichen
     * Produktdaten auswählen.
     */

    if (taxonomyWithAttributes) {
      product.shopifyTaxonomyAttributes =
        await classifyProductAttributes(
          product,
          taxonomyWithAttributes
        );
    }

  } catch (error) {
    /*
     * Ein Fehler bei der Attributerkennung darf
     * niemals den normalen Produktscraper stoppen.
     */

    console.error(
      "SHOPIFY TAXONOMY ATTRIBUTE CLASSIFICATION ERROR:",
      error
    );

    product.shopifyTaxonomyAttributes = [];
  }
}

/*
 * =========================================================
 * MARKTBLATT KATEGORIE ERKENNEN
 * =========================================================
 *
 * Die Marktblatt-Kategorie wird anhand der Produktdaten
 * sowie der bereits ermittelten Shopify-Taxonomie
 * bestimmt.
 *
 * Die KI darf ausschließlich Kategorien aus unserer
 * eigenen Marktblatt-Taxonomie auswählen.
 *
 * Ein Fehler bei dieser Klassifizierung darf den
 * Produktimport niemals verhindern.
 */

product.marktblattCategoryId =
  "other";

product.marktblattCategoryName =
  "Sonstiges";

product.marktblattSubcategoryId =
  "other-products";

product.marktblattSubcategoryName =
  "Weitere Produkte";

product.marktblattCategoryConfidence =
  0;

product.marktblattCategoryTags = [
  "mb:category:other",
  "mb:subcategory:other-products",
];


try {
  const {
    classifyMarktblattProduct,
  } = await import(
    "../marktblatt-classification.server"
  );


  /*
   * Shopify-Taxonomie-Pfad zusätzlich an die
   * Marktblatt-Klassifizierung übergeben.
   */

  const classification =
    await classifyMarktblattProduct({
      ...product,

      shopifyTaxonomyId:
        taxonomy?.id ||
        product.shopifyTaxonomyId ||
        null,

      shopifyTaxonomyName:
        taxonomy?.name ||
        product.shopifyTaxonomyName ||
        null,

      shopifyTaxonomyFullName:
        taxonomy?.fullName ||
        null,
    });


  if (classification) {
    product.marktblattCategoryId =
      classification.categoryId;

    product.marktblattCategoryName =
      classification.categoryName;

    product.marktblattSubcategoryId =
      classification.subcategoryId;

    product.marktblattSubcategoryName =
      classification.subcategoryName;

    product.marktblattCategoryConfidence =
      classification.confidence;

    product.marktblattCategoryTags =
      classification.tags;
  }


  console.log(
    "SCRAPER MARKTBLATT CATEGORY RESULT:",
    {
      categoryId:
        product.marktblattCategoryId,

      categoryName:
        product.marktblattCategoryName,

      subcategoryId:
        product.marktblattSubcategoryId,

      subcategoryName:
        product.marktblattSubcategoryName,

      confidence:
        product.marktblattCategoryConfidence,

      tags:
        product.marktblattCategoryTags,
    }
  );

} catch (error) {
  console.error(
    "MARKTBLATT CATEGORY CLASSIFICATION ERROR:",
    error
  );

  /*
   * Der oben gesetzte Fallback bleibt bestehen:
   *
   * Sonstiges > Weitere Produkte
   */
}

/*
 * TEMPORÄRE DEBUG-AUSGABE
 * Zusätzliche Produktdaten nur im Server-Log anzeigen.
 */

console.log("SCRAPER ADDITIONAL PRODUCT DATA:", {
  sourceUrl: product.sourceUrl,
  sku: product.sku,
  gtin: product.gtin,
  mpn: product.mpn,
productType: product.productType,
material: product.material,
color: product.color,
size: product.size,
  availability: product.availability,
  category: product.category,
metaTitle: product.metaTitle,
metaDescription: product.metaDescription,
condition: product.condition,
gender: product.gender,
ageGroup: product.ageGroup,
adult: product.adult,
itemGroupId: product.itemGroupId,
shopifyTaxonomyId: product.shopifyTaxonomyId,
shopifyTaxonomyName: product.shopifyTaxonomyName,
shopifyTaxonomyAttributes:
  product.shopifyTaxonomyAttributes,
marktblattCategoryId:
  product.marktblattCategoryId,

marktblattCategoryName:
  product.marktblattCategoryName,

marktblattSubcategoryId:
  product.marktblattSubcategoryId,

marktblattSubcategoryName:
  product.marktblattSubcategoryName,

marktblattCategoryConfidence:
  product.marktblattCategoryConfidence,

marktblattCategoryTags:
  product.marktblattCategoryTags,
  compareAtPrice: product.compareAtPrice,
  compareAtPriceSource: product.compareAtPriceSource,
});

    if (!product.title) {
return cors(
  Response.json(
    {
      success: false,
      error:
        "Auf dieser Seite konnten keine eindeutigen Produktdaten gefunden werden.",
    },
    { status: 422 }
  )
);
    }

    /*
     * ERFOLGREICHE ANTWORT
     */

return cors(
  Response.json({
    success: true,
    product,
  })
);
  } catch (error) {
    console.error(
      "PRODUCT SCRAPE ERROR:",
      error
    );

    const message =
      error?.name ===
      "AbortError"
        ? "Die Produktseite hat nicht rechtzeitig geantwortet."
        : error instanceof Error
          ? error.message
          : "Das Produkt konnte nicht geprüft werden.";

return cors(
  Response.json(
    {
      success: false,
      error: message,
    },
    { status: 400 }
  )
);
  }
}


/*
 * =========================================================
 * GET-AUFRUF
 * =========================================================
 */

export async function loader({ request }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  return Response.json(
    {
      success: false,
      error: "Diese Schnittstelle erwartet eine POST-Anfrage.",
    },
    {
      status: 405,
      headers: corsHeaders,
    }
  );
}

