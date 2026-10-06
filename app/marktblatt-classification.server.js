/*
 * =========================================================
 * MARKTBLATT PRODUKT-KLASSIFIZIERUNG
 * =========================================================
 *
 * Aufgabe:
 *
 * Produktdaten + Shopify Taxonomie
 *              ↓
 *        OpenAI Klassifizierung
 *              ↓
 * Marktblatt Haupt-/Unterkategorie
 *              ↓
 * serverseitige Validierung
 *
 * WICHTIG:
 *
 * Die KI darf ausschließlich Kategorien auswählen,
 * die in marktblatt-taxonomy.server.js definiert sind.
 *
 * Sie darf KEINE Kategorie oder ID erfinden.
 */


import {
  getMarktblattTaxonomyForAi,
  findMarktblattCategory,
  findMarktblattSubcategory,
  buildMarktblattCategoryTags,
} from "./marktblatt-taxonomy.server";


/*
 * =========================================================
 * FALLBACK
 * =========================================================
 */

function createFallbackClassification() {
  return {
    categoryId:
      "other",

    categoryName:
      "Sonstiges",

    subcategoryId:
      "other-products",

    subcategoryName:
      "Weitere Produkte",

    confidence:
      0,

    tags:
      [
        "mb:category:other",
        "mb:subcategory:other-products",
      ],

    classifiedByAi:
      false,
  };
}


/*
 * =========================================================
 * CONFIDENCE NORMALISIEREN
 * =========================================================
 */

function normalizeConfidence(value) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      number
    )
  );
}


/*
 * =========================================================
 * PRODUKT KLASSIFIZIEREN
 * =========================================================
 */

export async function classifyMarktblattProduct(
  product
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY ist nicht konfiguriert."
    );
  }


  /*
   * =======================================================
   * PRODUKTDATEN
   * =======================================================
   */

  const title =
    String(
      product?.title || ""
    )
      .trim()
      .slice(0, 500);


  const description =
    String(
      product?.description || ""
    )
      .trim()
      .slice(0, 3000);


  const sourceCategory =
    String(
      product?.category || ""
    )
      .trim()
      .slice(0, 500);


  const productType =
    String(
      product?.productType || ""
    )
      .trim()
      .slice(0, 500);


  const brand =
    String(
      product?.brand || ""
    )
      .trim()
      .slice(0, 300);


  /*
   * Bereits erkannte Shopify Standard Product Taxonomy.
   *
   * Diese Information ist besonders wertvoll für die
   * Zuordnung zur Marktblatt-Navigation.
   */

  const shopifyTaxonomyId =
    String(
      product?.shopifyTaxonomyId || ""
    ).trim();


  const shopifyTaxonomyName =
    String(
      product?.shopifyTaxonomyName || ""
    )
      .trim()
      .slice(0, 500);


  const shopifyTaxonomyFullName =
    String(
      product?.shopifyTaxonomyFullName || ""
    )
      .trim()
      .slice(0, 1000);


  /*
   * =======================================================
   * ERLAUBTE MARKTBLATT-TAXONOMIE
   * =======================================================
   */

  const allowedTaxonomy =
    getMarktblattTaxonomyForAi();


  if (!allowedTaxonomy.length) {
    throw new Error(
      "Die Marktblatt-Taxonomie enthält keine Kategorien."
    );
  }


  /*
   * =======================================================
   * KI-PROMPT
   * =======================================================
   */

  const input = `
Classify this ecommerce product into the Marktblatt marketplace taxonomy.

IMPORTANT RULES:

You MUST select exactly ONE primary category and exactly ONE subcategory.

You may ONLY use category IDs and subcategory IDs from the allowed Marktblatt taxonomy supplied below.

Never invent a category.
Never invent a subcategory.
Never invent or modify an ID.

The subcategory MUST belong to the selected category.

Choose the most specific and commercially useful product category.

Classify what the product actually IS, not merely:
- who it is for
- what material it is made from
- what occasion it could be used for
- what style it has

Examples:

A stainless-steel necklace is:
category = jewelry-watches
subcategory = necklaces

It is NOT primarily:
material = stainless steel
gift for women
fashion accessory

A smartwatch is:
category = mobile
subcategory = smartwatches

A garden chair or garden table belongs to:
category = garden
subcategory = garden-furniture

Sports clothing belongs to:
category = sports
subcategory = sports-clothing

A tablet belongs to:
category = mobile
subcategory = tablets

Use the existing Shopify taxonomy as a strong classification signal when it is available.

If the Shopify taxonomy is very specific and clearly maps to a Marktblatt subcategory, prefer that mapping unless the actual product information clearly contradicts it.

Use the product title, description, source category and product type as additional evidence.

Only use:
category = other
subcategory = other-products

when no reasonable category in the supplied taxonomy fits the product.

Confidence must be a number between 0 and 1.

Use high confidence only when the classification is clear.

Return ONLY valid JSON.

Required JSON format:

{
  "categoryId": "EXACT_ALLOWED_CATEGORY_ID",
  "subcategoryId": "EXACT_ALLOWED_SUBCATEGORY_ID",
  "confidence": 0.95
}


PRODUCT DATA

Title:
${title}

Description:
${description}

Source category:
${sourceCategory}

Source product type:
${productType}

Brand:
${brand}


SHOPIFY TAXONOMY

ID:
${shopifyTaxonomyId}

Name:
${shopifyTaxonomyName}

Full path:
${shopifyTaxonomyFullName}


ALLOWED MARKTBLATT TAXONOMY

${JSON.stringify(allowedTaxonomy)}
`.trim();


  /*
   * =======================================================
   * OPENAI
   * =======================================================
   */

  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${apiKey}`,
        },

        body:
          JSON.stringify({
            model:
              "gpt-5.6-luna",

            input,

            reasoning: {
              effort:
                "low",
            },

            text: {
              verbosity:
                "low",
            },

            max_output_tokens:
              300,
          }),
      }
    );


  let result;

  try {
    result =
      await response.json();
  } catch {
    throw new Error(
      "Die Antwort der Marktblatt-Klassifizierung konnte nicht gelesen werden."
    );
  }


  if (!response.ok) {
    console.error(
      "OPENAI MARKTBLATT CLASSIFICATION ERROR:",
      result
    );

    throw new Error(
      result?.error?.message ||
      "Marktblatt-Klassifizierung fehlgeschlagen."
    );
  }


  /*
   * =======================================================
   * ANTWORTTEXT AUSLESEN
   * =======================================================
   */

  const outputText =
    result?.output
      ?.flatMap(
        (item) =>
          item?.content || []
      )
      ?.find(
        (item) =>
          item?.type ===
          "output_text"
      )
      ?.text
      ?.trim() ||
    null;


  if (!outputText) {
    console.error(
      "OPENAI MARKTBLATT CLASSIFICATION EMPTY OUTPUT:",
      result
    );

    return createFallbackClassification();
  }


  /*
   * =======================================================
   * JSON PARSEN
   * =======================================================
   */

  let parsed;

  try {
    parsed =
      JSON.parse(
        outputText
      );
  } catch {
    console.error(
      "OPENAI MARKTBLATT CLASSIFICATION RAW OUTPUT:",
      outputText
    );

    return createFallbackClassification();
  }


  /*
   * =======================================================
   * SERVERSEITIGE VALIDIERUNG
   * =======================================================
   *
   * Wir vertrauen der KI-Ausgabe NICHT blind.
   */

  const categoryId =
    typeof parsed?.categoryId ===
      "string"
      ? parsed.categoryId.trim()
      : "";


  const subcategoryId =
    typeof parsed?.subcategoryId ===
      "string"
      ? parsed.subcategoryId.trim()
      : "";


  /*
   * Hauptkategorie muss existieren.
   */

  const category =
    findMarktblattCategory(
      categoryId
    );


  if (
    !category ||
    category.secondary === true
  ) {
    console.error(
      "MARKTBLATT INVALID AI CATEGORY:",
      {
        categoryId,
        subcategoryId,
      }
    );

    return createFallbackClassification();
  }


  /*
   * Unterkategorie muss existieren UND
   * zur gewählten Hauptkategorie gehören.
   */

  const subcategory =
    findMarktblattSubcategory(
      categoryId,
      subcategoryId
    );


  if (!subcategory) {
    console.error(
      "MARKTBLATT INVALID AI SUBCATEGORY:",
      {
        categoryId,
        subcategoryId,
      }
    );

    return createFallbackClassification();
  }


  /*
   * =======================================================
   * CONFIDENCE
   * =======================================================
   */

  const confidence =
    normalizeConfidence(
      parsed?.confidence
    );


  /*
   * =======================================================
   * TAGS
   * =======================================================
   */

  const tags =
    buildMarktblattCategoryTags(
      categoryId,
      subcategoryId
    );


  /*
   * =======================================================
   * ENDGÜLTIGES ERGEBNIS
   * =======================================================
   */

  const classification = {
    categoryId:
      category.id,

    categoryName:
      category.name,

    subcategoryId:
      subcategory.id,

    subcategoryName:
      subcategory.name,

    confidence,

    tags,

    classifiedByAi:
      true,
  };


  console.log(
    "MARKTBLATT CATEGORY CLASSIFICATION:",
    {
      title,

      shopifyTaxonomy:
        shopifyTaxonomyName ||
        null,

      category:
        classification.categoryName,

      subcategory:
        classification.subcategoryName,

      confidence:
        classification.confidence,

      tags:
        classification.tags,
    }
  );


  return classification;
}