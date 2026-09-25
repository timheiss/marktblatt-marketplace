import { unauthenticated } from "./shopify.server";

import {
  classifyProduct,
  classifyProductSearchTerms,
} from "./classification.server";

/*
 * =========================================================
 * SHOPIFY TAXONOMY MATCHER
 * =========================================================
 *
 * Sucht anhand der ausgelesenen Produktdaten nach einer
 * passenden Shopify-Produktkategorie.
 *
 * Funktioniert grundsätzlich für alle Produktbereiche:
 *
 * - Schmuck
 * - Smartphones
 * - Handtaschen
 * - Werkzeug
 * - Kleidung
 * - Elektronik
 * - Möbel
 * - usw.
 */


/*
 * =========================================================
 * TEXT NORMALISIEREN
 * =========================================================
 */

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


/*
 * =========================================================
 * SUCHBEGRIFF ERMITTELN
 * =========================================================
 */

function buildSearchTerms(
  product,
  aiClassification = null,
  aiSearchTerms = null
) {
  const terms = [];

  /*
   * Strukturierte KI-Suchbegriffe zuerst.
   *
   * Reihenfolge:
   * 1. präziser Begriff
   * 2. breiterer Oberbegriff
   * 3. alternative Taxonomiebezeichnung
   */

  if (aiSearchTerms?.primary) {
    terms.push(
      aiSearchTerms.primary
    );
  }

  if (aiSearchTerms?.broader) {
    terms.push(
      aiSearchTerms.broader
    );
  }

  if (aiSearchTerms?.alternative) {
    terms.push(
      aiSearchTerms.alternative
    );
  }


  /*
   * Bisherige einzelne KI-Klassifizierung
   * als zusätzlicher Fallback.
   */

  if (aiClassification) {
    terms.push(
      aiClassification
    );
  }


  /*
   * Direkt von der Produktseite erkannte Daten.
   */

  if (product?.category) {
    terms.push(
      product.category
    );
  }

  if (product?.productType) {
    terms.push(
      product.productType
    );
  }


  /*
   * Produkttitel als letzter Fallback.
   */

  if (product?.title) {
    terms.push(
      product.title
    );
  }


  /*
   * Leere und doppelte Begriffe entfernen.
   */

  return [
    ...new Set(
      terms
        .map(
          (value) =>
            String(value).trim()
        )
        .filter(Boolean)
    ),
  ];
}

/*
 * =========================================================
 * KANDIDAT BEWERTEN
 * =========================================================
 */

function scoreCategory(category, product, searchTerm) {
  let score = 0;

  const categoryName =
    normalizeText(category?.name);

  const fullName =
    normalizeText(category?.fullName);

  const search =
    normalizeText(searchTerm);

  const productCategory =
    normalizeText(product?.category);

  const productType =
    normalizeText(product?.productType);

  const title =
    normalizeText(product?.title);


  /*
   * Exakte Übereinstimmung mit Kategorie
   */

  if (
    productCategory &&
    categoryName === productCategory
  ) {
    score += 100;
  }


  /*
   * Exakte Übereinstimmung mit Produkttyp
   */

  if (
    productType &&
    categoryName === productType
  ) {
    score += 90;
  }


  /*
   * Suchbegriff entspricht Kategoriename
   */

  if (
    search &&
    categoryName === search
  ) {
    score += 80;
  }


  /*
   * Kategorie kommt im vollständigen Pfad vor
   */

  if (
    productCategory &&
    fullName.includes(productCategory)
  ) {
    score += 45;
  }


  /*
   * Produkttyp kommt im vollständigen Pfad vor
   */

  if (
    productType &&
    fullName.includes(productType)
  ) {
    score += 40;
  }


  /*
   * Kategoriename kommt im Produkttitel vor.
   */

  if (
    categoryName &&
    title.includes(categoryName)
  ) {
    score += 35;
  }


/*
 * Leaf-Kategorien nur bevorzugen, wenn bereits
 * eine echte textliche Übereinstimmung besteht.
 *
 * Ein fremder Treffer wie "Chain Cutters" darf
 * nicht allein wegen isLeaf Punkte erhalten.
 */

if (
  category?.isLeaf &&
  score > 0
) {
  score += 20;
}


  return score;
}

/*
 * =========================================================
 * MEHRDEUTIGE SHOPIFY-KATEGORIEN ERKENNEN
 * =========================================================
 *
 * Wenn mehrere Shopify-Kategorien denselben Namen haben,
 * reicht der Kategoriename allein nicht aus.
 *
 * Beispiel:
 *
 * Socks
 * -> normale Bekleidung
 * -> Sports Collectibles
 *
 * In diesem Fall lassen wir die KI anhand des vollständigen
 * Shopify-Pfads entscheiden.
 */

async function chooseBestTaxonomyCandidate(
  product,
  candidates,
  aiClassification
) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return null;
  }

/*
 * Wenn Shopify mehrere Kategorien mit exakt demselben
 * Namen wie die KI-Klassifizierung liefert, müssen wir
 * diese anhand ihres vollständigen Taxonomiepfads
 * unterscheiden.
 *
 * Beispiel:
 *
 * Socks
 * -> Apparel & Accessories > ... > Socks
 * -> Sports Collectibles > ... > Socks
 */

const normalizedClassification =
  normalizeText(aiClassification);

const exactNameCandidates =
  normalizedClassification
    ? candidates.filter(
        (candidate) =>
          normalizeText(candidate?.name) ===
          normalizedClassification
      )
    : [];


/*
 * Mehrere gleichnamige Kategorien:
 * Nur diese Kandidaten gehen in die semantische
 * Pfadauswahl.
 */

let candidatesToEvaluate =
  exactNameCandidates.length > 1
    ? exactNameCandidates
    : null;

  /*
   * Zunächst Kandidaten mit dem höchsten normalen
   * Score bestimmen.
   */

  const highestScore =
    Math.max(
      ...candidates.map(
        (candidate) =>
          candidate.score || 0
      )
    );

const topCandidates =
  candidatesToEvaluate ||
  candidates.filter(
    (candidate) =>
      candidate.score === highestScore
  );


  /*
   * Eindeutiger Gewinner:
   * keine zusätzliche KI-Abfrage notwendig.
   */

  if (topCandidates.length === 1) {
    return topCandidates[0];
  }


  /*
   * Nur bei einem echten Gleichstand lassen wir die KI
   * zwischen den offiziellen Shopify-Pfaden entscheiden.
   */

  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return topCandidates[0];
  }


  const candidateText =
    topCandidates
      .map(
        (candidate, index) =>
          `${index + 1}. ${candidate.id} | ${candidate.fullName}`
      )
      .join("\n");


  const input = `
Choose the single best Shopify Standard Product Taxonomy category for this ecommerce product.

You MUST choose only one category from the candidate list below.

Return ONLY the exact Shopify category ID.
Do not return explanations.
Do not invent an ID.

Product title:
${String(product?.title || "")}

Source category:
${String(product?.category || "")}

Source product type:
${String(product?.productType || "")}

AI product classification:
${String(aiClassification || "")}

Description:
${String(product?.description || "").slice(0, 1500)}

Candidate Shopify categories:
${candidateText}
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
              200,
          }),
        }
      );


    const result =
      await response.json();


    if (!response.ok) {
      console.error(
        "TAXONOMY DISAMBIGUATION AI ERROR:",
        result
      );

      return topCandidates[0];
    }


    const selectedId =
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


    /*
     * Sicherheitsprüfung:
     *
     * Die KI darf ausschließlich eine ID verwenden,
     * die Shopify vorher geliefert hat.
     */

    const selected =
      topCandidates.find(
        (candidate) =>
          candidate.id === selectedId
      ) || null;


    if (!selected) {
      console.warn(
        "TAXONOMY DISAMBIGUATION INVALID RESULT:",
        selectedId
      );

      return topCandidates[0];
    }


    console.log(
      "SHOPIFY TAXONOMY DISAMBIGUATION:",
      {
        title:
          product?.title,

        aiClassification,

        candidates:
          topCandidates.map(
            (candidate) => ({
              id:
                candidate.id,

              fullName:
                candidate.fullName,

              score:
                candidate.score,
            })
          ),

        selected: {
          id:
            selected.id,

          fullName:
            selected.fullName,
        },
      }
    );


    return selected;

  } catch (error) {
    console.error(
      "TAXONOMY DISAMBIGUATION ERROR:",
      error
    );

    return topCandidates[0];
  }
}

/*
 * =========================================================
 * SHOPIFY TAXONOMY SUCHEN
 * =========================================================
 */

async function searchTaxonomy(admin, search) {
  const response =
    await admin.graphql(
      `#graphql
        query TaxonomyMatcher($search: String!) {
          taxonomy {
            categories(
              first: 20
              search: $search
            ) {
              nodes {
                id
                name
                fullName
                isLeaf
              }
            }
          }
        }
      `,
      {
        variables: {
          search,
        },
      }
    );

  const result =
    await response.json();

  if (result?.errors?.length) {
    throw new Error(
      result.errors
        .map((error) => error.message)
        .join(", ")
    );
  }

  return (
    result?.data?.taxonomy?.categories?.nodes ||
    []
  );
}


/*
 * =========================================================
 * BESTE SHOPIFY-KATEGORIE ERMITTELN
 * =========================================================
 */

export async function findShopifyTaxonomy(product) {
  try {
    const marktblattShop =
      process.env.MARKTBLATT_SHOP;

    if (!marktblattShop) {
      console.warn(
        "TAXONOMY: MARKTBLATT_SHOP fehlt."
      );

      return null;
    }


    /*
 * =========================================================
 * KI-KLASSIFIZIERUNG
 * =========================================================
 *
 * Die KI liefert nur einen englischen Produkttyp.
 * Eine Shopify-ID darf ausschließlich aus der
 * Shopify Taxonomy API stammen.
 */

let aiClassification = null;

try {
  aiClassification =
    await classifyProduct(product);
} catch (error) {
  console.error(
    "AI TAXONOMY CLASSIFICATION ERROR:",
    error
  );

  /*
   * Wichtig:
   * Fällt OpenAI aus, arbeitet unser bisheriger
   * Taxonomy-Matcher trotzdem weiter.
   */
}

/*
 * =========================================================
 * ERWEITERTE TAXONOMIE-SUCHBEGRIFFE
 * =========================================================
 */

let aiSearchTerms = null;

try {
  aiSearchTerms =
    await classifyProductSearchTerms(
      product
    );
} catch (error) {
  console.error(
    "AI TAXONOMY SEARCH TERMS ERROR:",
    error
  );

  /*
   * Kein Abbruch:
   * Die bisherige Klassifizierung und die
   * Produktdaten bleiben als Fallback erhalten.
   */
}

/*
 * Suchbegriffe aufbauen.
 */

const searchTerms =
  buildSearchTerms(
    product,
    aiClassification,
    aiSearchTerms
  );

if (!searchTerms.length) {
  return null;
}


    const { admin } =
      await unauthenticated.admin(
        marktblattShop
      );


    const candidates = [];


    /*
     * Maximal drei unterschiedliche Suchläufe:
     *
     * 1. erkannte Kategorie
     * 2. Produkttyp
     * 3. Produkttitel
     */

    for (
      const searchTerm of
      searchTerms.slice(0, 7)
    ) {
      try {
        const results =
          await searchTaxonomy(
            admin,
            searchTerm
          );

        for (const category of results) {
          const existing =
            candidates.find(
              (candidate) =>
                candidate.id ===
                category.id
            );

          const score =
            scoreCategory(
              category,
              product,
              searchTerm
            );

          if (existing) {
            existing.score =
              Math.max(
                existing.score,
                score
              );

            continue;
          }

          candidates.push({
            ...category,
            score,
          });
        }
      } catch (error) {
        console.error(
          "TAXONOMY SEARCH ERROR:",
          searchTerm,
          error
        );
      }
    }


    if (!candidates.length) {
      return null;
    }


    /*
     * Höchste Bewertung zuerst.
     */

    candidates.sort(
      (a, b) =>
        b.score - a.score
    );


const best =
  await chooseBestTaxonomyCandidate(
    product,
    candidates,
    aiClassification
  );


    /*
     * Sicherheitsgrenze.
     *
     * Bei schwachen Treffern lieber keine Kategorie
     * speichern als eine falsche Kategorie.
     */

    if (
      !best ||
      best.score < 20
    ) {
      return null;
    }


    console.log(
      "SHOPIFY TAXONOMY MATCH:",
      {
        title:
          product?.title,

        sourceCategory:
          product?.category,

        productType:
          product?.productType,

aiClassification:
  aiClassification,

        taxonomyId:
          best.id,

        taxonomyName:
          best.name,

        taxonomyFullName:
          best.fullName,

        score:
          best.score,
      }
    );


    return {
      id: best.id,
      name: best.name,
      fullName: best.fullName,
      isLeaf: best.isLeaf,
      score: best.score,
    };

  } catch (error) {
    /*
     * Wichtig:
     *
     * Ein Taxonomiefehler darf niemals verhindern,
     * dass das Produkt grundsätzlich ausgelesen wird.
     */

    console.error(
      "SHOPIFY TAXONOMY MATCHER ERROR:",
      error
    );

    return null;
  }
}


/*
 * =========================================================
 * SHOPIFY TAXONOMIE-ATTRIBUTE LADEN
 * =========================================================
 *
 * Lädt zu einer bereits bekannten Shopify-Kategorie
 * die offiziellen Attribute und erlaubten Werte.
 *
 * Beispiel:
 * Bracelets -> Color, Target gender, Jewelry material,
 * Bracelet design usw.
 */

export async function getShopifyTaxonomyAttributes(
  taxonomyId,
  taxonomyName
) {

  try {
if (
  !taxonomyId ||
  !taxonomyName
) {
  return null;
}

    const marktblattShop =
      process.env.MARKTBLATT_SHOP;

    if (!marktblattShop) {
      throw new Error(
        "MARKTBLATT_SHOP ist nicht konfiguriert."
      );
    }

    const { admin } =
      await unauthenticated.admin(
        marktblattShop
      );


    /*
     * Die Taxonomy API bietet hier keine einfache
     * category(id: ...) Abfrage.
     *
     * Deshalb suchen wir die Kategorien und wählen
     * anschließend exakt anhand der Shopify-ID aus.
     */

    const response =
      await admin.graphql(
        `#graphql
          query TaxonomyAttributes(
            $search: String!
          ) {
            taxonomy {
              categories(
                first: 20
                search: $search
              ) {
                nodes {
                  id
                  name
                  fullName
                  isLeaf

                  attributes(first: 50) {
                    nodes {
                      __typename

                      ... on TaxonomyAttribute {
                        id
                      }

                      ... on TaxonomyChoiceListAttribute {
                        id
                        name

                        values(first: 100) {
                          nodes {
                            id
                            name
                          }
                        }
                      }

                      ... on TaxonomyMeasurementAttribute {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        {
variables: {
  search:
    String(taxonomyName).trim(),
},
        }
      );

    const result =
      await response.json();

    if (result?.errors?.length) {
      throw new Error(
        result.errors
          .map(
            (error) =>
              error.message
          )
          .join(", ")
      );
    }

    const categories =
      result?.data
        ?.taxonomy
        ?.categories
        ?.nodes || [];

    const category =
      categories.find(
        (item) =>
          item.id === taxonomyId
      ) || null;

    return category;

  } catch (error) {
    console.error(
      "SHOPIFY TAXONOMY ATTRIBUTES ERROR:",
      error
    );

    return null;
  }
}