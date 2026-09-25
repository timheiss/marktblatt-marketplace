/*
 * =========================================================
 * MARKTBLATT PRODUKT-ATTRIBUT-KLASSIFIZIERUNG
 * =========================================================
 *
 * Die KI darf ausschließlich Werte auswählen,
 * die zuvor von der Shopify Taxonomy API geliefert wurden.
 *
 * Sie erfindet KEINE Shopify IDs.
 */

export async function classifyProductAttributes(
  product,
  taxonomyCategory
) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY ist nicht konfiguriert."
    );
  }


  const title =
    String(product?.title || "").trim();

  const description =
    String(product?.description || "")
      .trim()
      .slice(0, 2500);

  const sourceCategory =
    String(product?.category || "").trim();

  const productType =
    String(product?.productType || "").trim();


  /*
   * Shopify-Attribute für die KI kompakt aufbereiten.
   */

  const attributes =
    taxonomyCategory?.attributes?.nodes || [];

  const allowedAttributes =
    attributes
      .filter(
        (attribute) =>
          attribute?.name &&
          attribute?.values?.nodes?.length
      )
      .map((attribute) => ({
        name: attribute.name,

        values:
          attribute.values.nodes.map(
            (value) => ({
              id: value.id,
              name: value.name,
            })
          ),
      }));


  if (!allowedAttributes.length) {
    return [];
  }


  const input = `
Classify the attributes of this ecommerce product.

IMPORTANT RULES:

You may ONLY select attribute values from the Shopify taxonomy values provided below.

Never invent an attribute.
Never invent a value.
Never invent or modify an ID.

Only select a value when the product information provides sufficient evidence.

If an attribute cannot be determined reliably, omit it.

An attribute may contain multiple values only when the product clearly has multiple applicable values.

Return ONLY valid JSON.

Required JSON format:

{
  "attributes": [
    {
      "attributeName": "Color",
      "values": [
        {
          "id": "EXACT SHOPIFY VALUE ID",
          "name": "EXACT SHOPIFY VALUE NAME"
        }
      ]
    }
  ]
}

Product:

Title:
${title}

Description:
${description}

Source category:
${sourceCategory}

Source product type:
${productType}

Shopify category:
${taxonomyCategory?.name || ""}

Shopify category path:
${taxonomyCategory?.fullName || ""}

Allowed Shopify attributes and values:

${JSON.stringify(allowedAttributes)}
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
            1000,
        }),
      }
    );


  const result =
    await response.json();


  if (!response.ok) {
    console.error(
      "OPENAI ATTRIBUTE CLASSIFICATION ERROR:",
      result
    );

    throw new Error(
      result?.error?.message ||
      "Attributklassifizierung fehlgeschlagen."
    );
  }


  /*
   * Antworttext auslesen.
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
    throw new Error(
      "Die KI hat keine Attribute zurückgegeben."
    );
  }


  /*
   * JSON parsen.
   */

  let parsed;

  try {
    parsed =
      JSON.parse(outputText);
  } catch {
    console.error(
      "OPENAI ATTRIBUTE RAW OUTPUT:",
      outputText
    );

    throw new Error(
      "Die KI-Antwort enthält kein gültiges JSON."
    );
  }


  const selectedAttributes =
    Array.isArray(parsed?.attributes)
      ? parsed.attributes
      : [];


  /*
   * =========================================================
   * SERVERSEITIGE VALIDIERUNG
   * =========================================================
   *
   * Wir vertrauen der KI-Ausgabe NICHT blind.
   *
   * Jede zurückgegebene ID muss tatsächlich in den zuvor
   * von Shopify gelieferten Taxonomiewerten existieren.
   */

  const validated = [];


  for (
    const selected of
    selectedAttributes
  ) {
    const allowedAttribute =
      allowedAttributes.find(
        (attribute) =>
          attribute.name ===
          selected?.attributeName
      );

    if (!allowedAttribute) {
      continue;
    }


    const selectedValues =
      Array.isArray(selected?.values)
        ? selected.values
        : [];


    const validValues =
      selectedValues
        .map((selectedValue) =>
          allowedAttribute.values.find(
            (allowedValue) =>
              allowedValue.id ===
                selectedValue?.id &&
              allowedValue.name ===
                selectedValue?.name
          )
        )
        .filter(Boolean);


    if (!validValues.length) {
      continue;
    }


    validated.push({
      attributeName:
        allowedAttribute.name,

      values:
        validValues,
    });
  }


  console.log(
    "MARKTBLATT AI ATTRIBUTES:",
    {
      title,
      taxonomy:
        taxonomyCategory?.name,

      attributes:
        validated,
    }
  );


  return validated;
}