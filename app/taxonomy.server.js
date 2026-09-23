import { unauthenticated } from "./shopify.server";


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

function buildSearchTerms(product) {
  const terms = [];

  /*
   * Bereits erkannte Kategorie ist normalerweise
   * unser stärkstes Signal.
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
   * Anschließend Produkttitel.
   */

  if (product?.title) {
    terms.push(product.title);
  }

  /*
   * Doppelte Begriffe entfernen.
   */

  return [
    ...new Set(
      terms
        .map((value) => String(value).trim())
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
   * Leaf-Kategorien bevorzugen.
   *
   * Das ist wichtig, weil wir möglichst die konkrete
   * Produktkategorie und nicht nur einen Oberbegriff wollen.
   */

  if (category?.isLeaf) {
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


    const searchTerms =
      buildSearchTerms(product);

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
      searchTerms.slice(0, 3)
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