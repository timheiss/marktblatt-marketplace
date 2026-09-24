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
Classify this ecommerce product.

Return only the most precise common English product category name.

The result will be used to search the Shopify Standard Product Taxonomy.

Do not return explanations.
Do not return a Shopify ID.
Do not return JSON.
Do not invent product properties.

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

console.log(
  "OPENAI RAW RESPONSE:",
  JSON.stringify(
    result,
    null,
    2
  )
);

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