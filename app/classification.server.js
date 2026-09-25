/*
 * =========================================================
 * MARKTBLATT PRODUKT-KLASSIFIZIERUNG
 * =========================================================
 *
 * Die KI bestimmt ausschließlich einen präzisen
 * englischen Produkttyp.
 *
 * Sie bestimmt KEINE Shopify-ID.
 * Die endgültige Kategorie-ID kommt später ausschließlich
 * aus der offiziellen Shopify Taxonomy API.
 */

export async function classifyProduct(product) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY ist nicht konfiguriert."
    );
  }


  const title =
    String(product?.title || "")
      .trim();

  const category =
    String(product?.category || "")
      .trim();

  const productType =
    String(product?.productType || "")
      .trim();

  const description =
    String(product?.description || "")
      .trim()
      .slice(0, 1500);


  const input = `
Classify this ecommerce product for the Shopify Standard Product Taxonomy.

Return only one concise English product category search term.

Prefer the standard general product category over a more specific product style or design.

Examples:
Kordelarmband -> Bracelets
Goldarmband -> Bracelets
Smartphone -> Mobile Phones
Handtasche -> Handbags
Akkuschrauber -> Drills

Do not return explanations.
Do not return a Shopify ID.
Do not return JSON.
Do not include materials, styles, colors, gender, or other product attributes.

Product title:
${title}

Source category:
${category}

Source product type:
${productType}

Description:
${description}
`.trim();


  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${apiKey}`,
        },

body: JSON.stringify({
  model:
    "gpt-5.6-luna",

  input,

  reasoning: {
    effort: "low",
  },

  text: {
    verbosity: "low",
  },

  max_output_tokens:
    200,
}),
      }
    );


  const result =
    await response.json();

  if (!response.ok) {
    console.error(
      "OPENAI CLASSIFICATION ERROR:",
      result
    );

    throw new Error(
      result?.error?.message ||
      "Produktklassifizierung fehlgeschlagen."
    );
  }


  /*
   * Text aus der Responses-API extrahieren.
   */

  const classification =
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


  if (!classification) {
    throw new Error(
      "Die KI hat keinen Produkttyp zurückgegeben."
    );
  }


  console.log(
    "MARKTBLATT AI CLASSIFICATION:",
    {
      title,
      sourceCategory:
        category || null,

      classification,
    }
  );


  return classification;
}

/*
 * =========================================================
 * MARKTBLATT TAXONOMIE-SUCHBEGRIFFE
 * =========================================================
 *
 * Liefert mehrere englische Suchbegriffe für die
 * Shopify Standard Product Taxonomy.
 *
 * Die KI liefert KEINE Shopify-ID.
 */

export async function classifyProductSearchTerms(product) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY ist nicht konfiguriert."
    );
  }

  const title =
    String(product?.title || "")
      .trim();

  const category =
    String(product?.category || "")
      .trim();

  const productType =
    String(product?.productType || "")
      .trim();

  const description =
    String(product?.description || "")
      .trim()
      .slice(0, 1500);


  const input = `
Generate search terms for finding the correct category in the Shopify Standard Product Taxonomy.

Return exactly three concise English category search terms:

1. primary:
   The most precise general product category.

2. broader:
   A broader parent product category.

3. alternative:
   Another likely taxonomy term or synonym.

The terms must describe what the product IS.

Do not include:
- materials
- colors
- gender
- sizes
- styles
- brands
- Shopify IDs
- explanations

Examples:

Scrunchie:
primary: Scrunchies
broader: Hair Accessories
alternative: Ponytail Holders

Gold bracelet:
primary: Bracelets
broader: Jewelry
alternative: Wrist Jewelry

Wool socks:
primary: Socks
broader: Clothing
alternative: Hosiery

Product title:
${title}

Source category:
${category}

Source product type:
${productType}

Description:
${description}

Return ONLY valid JSON in exactly this format:
{
  "primary": "...",
  "broader": "...",
  "alternative": "..."
}
`.trim();


  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model:
            "gpt-5.6-luna",

          input,

          reasoning: {
            effort: "low",
          },

          text: {
            verbosity: "low",
          },

          max_output_tokens:
            300,
        }),
      }
    );


  const result =
    await response.json();

  if (!response.ok) {
    console.error(
      "OPENAI SEARCH TERMS ERROR:",
      result
    );

    throw new Error(
      result?.error?.message ||
      "Taxonomie-Suchbegriffe konnten nicht ermittelt werden."
    );
  }


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
    throw new Error(
      "Die KI hat keine Taxonomie-Suchbegriffe zurückgegeben."
    );
  }


  let parsed;

  try {
    parsed =
      JSON.parse(outputText);
  } catch {
    console.error(
      "INVALID SEARCH TERMS JSON:",
      outputText
    );

    throw new Error(
      "Die KI hat ungültige Taxonomie-Suchbegriffe zurückgegeben."
    );
  }


  const searchTerms = {
    primary:
      String(parsed?.primary || "")
        .trim(),

    broader:
      String(parsed?.broader || "")
        .trim(),

    alternative:
      String(parsed?.alternative || "")
        .trim(),
  };


  if (!searchTerms.primary) {
    throw new Error(
      "Die KI hat keinen primären Taxonomie-Suchbegriff zurückgegeben."
    );
  }


  console.log(
    "MARKTBLATT AI TAXONOMY SEARCH TERMS:",
    {
      title,
      searchTerms,
    }
  );


  return searchTerms;
}