import { unauthenticated } from "./shopify.server";

import { classifyProduct } from "./classification.server";

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
  aiClassification = null
) {
  const terms = [];

  /*
   * KI-Klassifizierung zuerst.
   *
   * Beispiel:
   * "Armbänder" -> "Bracelets"
   *
   * Dadurch kann die Shopify-Taxonomie mit einem
   * präzisen englischen Produkttyp durchsucht werden.
   */

  if (aiClassification) {
    terms.push(aiClassification);
  }

  /*
   * Danach die direkt von der Produktseite
   * erkannte Kategorie.
   */

  if (product?.category) {
    terms.push(product.category);
  }

  /*
   * Danach Produkttyp.
   */

  if (product?.productType) {
    terms.push(product.productType);
  }

  /*
   * Produkttitel als letzter Fallback.
   */

  if (product?.title) {
    terms.push(product.title);
  }

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
 * Suchbegriffe aufbauen.
 */

const searchTerms =
  buildSearchTerms(
    product,
    aiClassification
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
      searchTerms.slice(0, 4)
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
      candidates[0];


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
  taxonomyId
) {
  try {
    if (!taxonomyId) {
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
            /*
             * Die konkrete Suche setzen wir unten
             * über den Kategorienamen.
             */
            search: "Bracelets",
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