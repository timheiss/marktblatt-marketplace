/*
 * =========================================================
 * MARKTBLATT SEO-OPTIMIERUNG
 * =========================================================
 *
 * Prüft und optimiert SEO-Titel und Meta-Beschreibung
 * eines Produktes.
 *
 * Regeln:
 *
 * - SEO-Titel maximal 70 Zeichen
 * - Meta-Beschreibung maximal 160 Zeichen
 * - Keine Eigenschaften erfinden
 * - Gute vorhandene SEO-Daten möglichst erhalten
 * - Schlechte oder fehlende SEO-Daten verbessern
 * - Bei KI-Fehler immer sicherer lokaler Fallback
 *
 * Die SEO-Optimierung darf niemals verhindern,
 * dass ein Produkt eingelesen wird.
 */


const MAX_META_TITLE_LENGTH = 70;
const MAX_META_DESCRIPTION_LENGTH = 160;


/*
 * =========================================================
 * TEXT BEREINIGEN
 * =========================================================
 */

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}


/*
 * =========================================================
 * TEXT SINNVOLL KÜRZEN
 * =========================================================
 *
 * Möglichst nicht mitten im Wort abschneiden.
 */

function truncateText(
  value,
  maxLength
) {
  const text =
    cleanText(value);

  if (text.length <= maxLength) {
    return text;
  }

  const shortened =
    text.slice(0, maxLength + 1);

  const lastSpace =
    shortened.lastIndexOf(" ");

  if (
    lastSpace >=
    Math.floor(maxLength * 0.7)
  ) {
    return shortened
      .slice(0, lastSpace)
      .replace(
        /[\s,;:–—-]+$/g,
        ""
      )
      .trim();
  }

  return text
    .slice(0, maxLength)
    .trim();
}


/*
 * =========================================================
 * LOKALER FALLBACK
 * =========================================================
 *
 * Funktioniert auch dann, wenn OpenAI nicht erreichbar ist.
 */

function createFallbackSeo({
  title,
  description,
  metaTitle,
  metaDescription,
}) {
  const cleanTitle =
    cleanText(title);

  const cleanDescription =
    cleanText(description);

  const existingMetaTitle =
    cleanText(metaTitle);

  const existingMetaDescription =
    cleanText(metaDescription);


  return {
    metaTitle:
      truncateText(
        existingMetaTitle ||
          cleanTitle,
        MAX_META_TITLE_LENGTH
      ) || null,

    metaDescription:
      truncateText(
        existingMetaDescription ||
          cleanDescription ||
          cleanTitle,
        MAX_META_DESCRIPTION_LENGTH
      ) || null,

    optimizedByAi: false,
  };
}


/*
 * =========================================================
 * SEO MIT KI PRÜFEN UND OPTIMIEREN
 * =========================================================
 */

export async function optimizeProductSeo({
  title,
  description,
  metaTitle,
  metaDescription,
}) {
  const fallback =
    createFallbackSeo({
      title,
      description,
      metaTitle,
      metaDescription,
    });


  const apiKey =
    process.env.OPENAI_API_KEY;


  /*
   * Ohne API-Key einfach den sicheren Fallback verwenden.
   */

  if (!apiKey) {
    console.warn(
      "MARKTBLATT SEO: OPENAI_API_KEY fehlt - lokaler Fallback wird verwendet."
    );

    return fallback;
  }


  const cleanTitle =
    cleanText(title);

  const cleanDescription =
    cleanText(description)
      .slice(0, 4000);

  const cleanMetaTitle =
    cleanText(metaTitle);

  const cleanMetaDescription =
    cleanText(metaDescription);


  /*
   * Ohne verwertbare Produktinformationen kann auch
   * die KI keinen sinnvollen SEO-Text erzeugen.
   */

  if (
    !cleanTitle &&
    !cleanDescription
  ) {
    return fallback;
  }


  const input = `
You are checking and optimizing SEO metadata for an ecommerce product.

The resulting metadata will be used for the product page.

IMPORTANT RULES:

Use ONLY facts contained in the supplied product information.

Never invent:
- product properties
- materials
- dimensions
- colors
- certifications
- benefits
- discounts
- prices
- availability
- shipping information
- guarantees
- awards
- brand claims

Do not use keyword stuffing.

Do not add generic advertising phrases when they provide no useful product information.

The text must primarily describe the specific product for a human search user.

META TITLE:

- Maximum 70 characters.
- Prefer an existing meta title if it is accurate, useful and descriptive.
- If the existing meta title is missing or poor, create a better title based on the product title.
- Clearly identify the product.
- Do not unnecessarily repeat words.
- Do not append a shop name unless it is already an important part of the product information.

META DESCRIPTION:

- Maximum 160 characters.
- Evaluate the existing meta description for quality even when one exists.
- Keep it if it is already useful, specific and accurately describes the product.
- Improve or replace it when it is vague, generic, repetitive, incomplete, mostly promotional, or provides little useful product information.
- Use the most relevant factual product characteristics from the supplied description.
- Write naturally for humans.
- Do not merely repeat the product title.
- Do not invent a call to action.
- A shorter description is acceptable when the available product information is limited.

LANGUAGE:

Use the same language as the product title and description.

Return ONLY valid JSON.

Required format:

{
  "metaTitle": "SEO title",
  "metaDescription": "SEO description"
}

PRODUCT TITLE:
${cleanTitle}

PRODUCT DESCRIPTION:
${cleanDescription}

EXISTING META TITLE:
${cleanMetaTitle}

EXISTING META DESCRIPTION:
${cleanMetaDescription}
`.trim();


  try {
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
              500,
          }),
        }
      );


    const result =
      await response.json();


    if (!response.ok) {
      console.error(
        "OPENAI SEO OPTIMIZATION ERROR:",
        result
      );

      return fallback;
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
      console.warn(
        "MARKTBLATT SEO: KI hat keine SEO-Daten zurückgegeben."
      );

      return fallback;
    }


    let parsed;

    try {
      parsed =
        JSON.parse(outputText);
    } catch {
      console.error(
        "OPENAI SEO RAW OUTPUT:",
        outputText
      );

      return fallback;
    }


    /*
     * =====================================================
     * SERVERSEITIGE LÄNGENBEGRENZUNG
     * =====================================================
     *
     * Auch wenn die KI die Vorgaben nicht exakt einhält,
     * verlassen niemals Texte > 70 / 160 Zeichen
     * diese Funktion.
     */

    const optimizedMetaTitle =
      truncateText(
        parsed?.metaTitle ||
          fallback.metaTitle,
        MAX_META_TITLE_LENGTH
      );


    const optimizedMetaDescription =
      truncateText(
        parsed?.metaDescription ||
          fallback.metaDescription,
        MAX_META_DESCRIPTION_LENGTH
      );


    console.log(
      "MARKTBLATT SEO OPTIMIZATION:",
      {
        title:
          cleanTitle,

        originalMetaTitle:
          cleanMetaTitle || null,

        metaTitle:
          optimizedMetaTitle || null,

        originalMetaDescription:
          cleanMetaDescription || null,

        metaDescription:
          optimizedMetaDescription || null,
      }
    );


    return {
      metaTitle:
        optimizedMetaTitle ||
        fallback.metaTitle,

      metaDescription:
        optimizedMetaDescription ||
        fallback.metaDescription,

      optimizedByAi: true,
    };

  } catch (error) {
    /*
     * Ein KI-Ausfall darf den Produktimport niemals
     * verhindern.
     */

    console.error(
      "MARKTBLATT SEO OPTIMIZATION FAILED:",
      error
    );

    return fallback;
  }
}