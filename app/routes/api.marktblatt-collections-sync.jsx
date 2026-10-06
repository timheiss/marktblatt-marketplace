import {
  unauthenticated,
} from "../shopify.server";

import {
  MARKTBLATT_TAXONOMY,
} from "../marktblatt-taxonomy.server";


/*
 * =========================================================
 * VERTRIEBSKANÄLE
 * =========================================================
 */

const TARGET_PUBLICATIONS = [
  "onlineshop",
  "online store",
  "google & youtube",
  "facebook & instagram",
];

const DESIRED_CHANNEL_GROUPS = [
  {
    label: "Onlineshop",
    aliases: [
      "onlineshop",
      "online store",
    ],
  },
  {
    label: "Google & YouTube",
    aliases: [
      "google & youtube",
    ],
  },
  {
    label: "Facebook & Instagram",
    aliases: [
      "facebook & instagram",
    ],
  },
];

const EXCLUDED_VENDOR =
  "Marktblatt Business Produkt";


function normalizePublicationName(
  value
) {
  return String(value || "")
    .trim()
    .toLowerCase();
}


/*
 * =========================================================
 * HANDLES
 * =========================================================
 */

function buildCategoryHandle(
  categoryId
) {
  return `mb-${categoryId}`;
}


function buildSubcategoryHandle(
  categoryId,
  subcategoryId
) {
  return (
    `mb-${categoryId}-${subcategoryId}`
  );
}


/*
 * =========================================================
 * GEWÜNSCHTE COLLECTIONS
 * =========================================================
 */

function buildDesiredCollections() {
  const collections = [];

  for (
    const category of
    MARKTBLATT_TAXONOMY
  ) {
    /*
     * Hauptkategorie
     */

    collections.push({
      level: "category",

      categoryId:
        category.id,

      subcategoryId:
        null,

      title:
        category.name,

      handle:
        buildCategoryHandle(
          category.id
        ),

      tag:
        `mb:category:${category.id}`,
    });


    /*
     * Unterkategorien
     */

    for (
      const [
        subcategoryId,
        subcategoryName,
      ] of category.subcategories
    ) {
      collections.push({
        level:
          "subcategory",

        categoryId:
          category.id,

        subcategoryId,

        title:
          subcategoryName,

        handle:
          buildSubcategoryHandle(
            category.id,
            subcategoryId
          ),

        tag:
          `mb:subcategory:${subcategoryId}`,
      });
    }
  }

  return collections;
}


/*
 * =========================================================
 * COLLECTION NACH HANDLE SUCHEN
 * =========================================================
 */

async function findCollectionByHandle(
  admin,
  handle
) {
  const response =
    await admin.graphql(
      `#graphql
      query FindMarktblattCollection(
        $query: String!
      ) {
        collections(
          first: 10
          query: $query
        ) {
          nodes {
            id
            title
            handle
          }
        }
      }
      `,
      {
        variables: {
          query:
            `handle:${handle}`,
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

  return (
    result?.data
      ?.collections
      ?.nodes || []
  ).find(
    (collection) =>
      collection.handle ===
      handle
  ) || null;
}


/*
 * =========================================================
 * AUTOMATISCHE COLLECTION ERSTELLEN
 * =========================================================
 *
 * Jede Collection besitzt ZWEI Bedingungen.
 *
 * ALLE müssen erfüllt sein:
 *
 * 1. Marktblatt-Kategorie-Tag vorhanden
 * 2. Anbieter != "Marktblatt Business Produkt"
 */

async function createTagCollection(
  admin,
  {
    title,
    handle,
    tag,
    level,
  }
) {
  const response =
    await admin.graphql(
      `#graphql
      mutation CreateMarktblattCollection(
        $collection: CollectionCreateInput!
      ) {
        collectionCreate(
          collection: $collection
        ) {
          collection {
            id
            title
            handle
          }

          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          collection: {
            title,
            handle,

            sources: [
              {
                source: {
                  title:
                    level === "category"
                      ? `Marktblatt Hauptkategorie: ${title}`
                      : `Marktblatt Unterkategorie: ${title}`,

                  inclusion: {
                    matchType:
                      "ALL",

                    conditions: [
                      /*
                       * Bedingung 1:
                       * Marktblatt Kategorie-Tag
                       */
                      {
                        productTag: {
                          relation:
                            "TAGGED_WITH",

                          values: [
                            tag,
                          ],

                          matchType:
                            "ANY",
                        },
                      },

                      /*
                       * Bedingung 2:
                       * Business-Produkte ausschließen
                       */
                      {
                        productVendor: {
                          relation:
                            "NOT_EQUALS",

                          values: [
                            EXCLUDED_VENDOR,
                          ],

                          matchType:
                            "ALL",
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
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

  const payload =
    result?.data
      ?.collectionCreate;

  const userErrors =
    payload?.userErrors || [];

  if (userErrors.length) {
    throw new Error(
      userErrors
        .map(
          (error) =>
            error.message
        )
        .join(", ")
    );
  }

  if (!payload?.collection) {
    throw new Error(
      "Shopify hat keine Collection zurückgegeben."
    );
  }

  return payload.collection;
}


/*
 * =========================================================
 * PUBLICATIONS LADEN
 * =========================================================
 */

async function getTargetPublications(
  admin
) {
  const response =
    await admin.graphql(
      `#graphql
      query MarktblattPublications {
        publications(first: 100) {
          nodes {
            id
            name
          }
        }
      }
      `
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
        .join(" ")
    );
  }

  const publications =
    result?.data
      ?.publications
      ?.nodes ?? [];


  const targetPublications =
    publications.filter(
      (publication) =>
        TARGET_PUBLICATIONS.includes(
          normalizePublicationName(
            publication.name
          )
        )
    );


  /*
   * Prüfen, ob alle drei gewünschten
   * Vertriebskanäle vorhanden sind.
   */

  const foundNames =
    new Set(
      targetPublications.map(
        (publication) =>
          normalizePublicationName(
            publication.name
          )
      )
    );


  const missingChannels =
    DESIRED_CHANNEL_GROUPS
      .filter(
        (group) =>
          !group.aliases.some(
            (alias) =>
              foundNames.has(alias)
          )
      )
      .map(
        (group) =>
          group.label
      );


  if (missingChannels.length) {
    throw new Error(
      `Folgende Vertriebskanäle wurden nicht gefunden: ${missingChannels.join(
        ", "
      )}`
    );
  }


  return targetPublications;
}


/*
 * =========================================================
 * COLLECTION VERÖFFENTLICHEN
 * =========================================================
 */

async function publishCollection(
  admin,
  collectionId,
  targetPublications
) {
  const publicationInputs =
    targetPublications.map(
      (publication) => ({
        publicationId:
          publication.id,
      })
    );


  const response =
    await admin.graphql(
      `#graphql
      mutation PublishMarktblattCollection(
        $id: ID!
        $input: [PublicationInput!]!
      ) {
        publishablePublish(
          id: $id
          input: $input
        ) {
          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          id:
            collectionId,

          input:
            publicationInputs,
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
        .join(" ")
    );
  }


  const userErrors =
    result?.data
      ?.publishablePublish
      ?.userErrors ?? [];


  if (userErrors.length) {
    throw new Error(
      userErrors
        .map(
          (error) =>
            error.message
        )
        .join(" ")
    );
  }


  return targetPublications.map(
    (publication) =>
      publication.name
  );
}


/*
 * =========================================================
 * ROUTE
 * =========================================================
 */

export async function loader({
  request,
}) {
  try {
    const shop =
      process.env.MARKTBLATT_SHOP;

    if (!shop) {
      throw new Error(
        "MARKTBLATT_SHOP fehlt."
      );
    }

    if (
      !shop.endsWith(
        ".myshopify.com"
      )
    ) {
      throw new Error(
        "MARKTBLATT_SHOP enthält keine gültige Shopify-Shop-Domain."
      );
    }


    const { admin } =
      await unauthenticated.admin(
        shop
      );


    /*
     * Vertriebskanäle EINMAL vor dem
     * Collection-Durchlauf laden.
     */

    const targetPublications =
      await getTargetPublications(
        admin
      );


    /*
     * =====================================================
     * BATCH-STEUERUNG
     * =====================================================
     *
     * Beispiel:
     *
     * ?offset=0&limit=25
     * ?offset=25&limit=25
     *
     * Maximal 25 Collections pro Aufruf.
     */

    const requestUrl =
      new URL(request.url);

    const requestedOffset =
      Number(
        requestUrl.searchParams.get(
          "offset"
        ) || 0
      );

    const requestedLimit =
      Number(
        requestUrl.searchParams.get(
          "limit"
        ) || 25
      );


    const offset =
      Number.isInteger(
        requestedOffset
      ) &&
      requestedOffset >= 0
        ? requestedOffset
        : 0;


    const limit =
      Number.isInteger(
        requestedLimit
      ) &&
      requestedLimit > 0
        ? Math.min(
            requestedLimit,
            25
          )
        : 25;


    /*
     * Gesamte Taxonomie erzeugen.
     */

    const allCollections =
      buildDesiredCollections();


    /*
     * Nur aktuellen Batch auswählen.
     */

    const desiredCollections =
      allCollections.slice(
        offset,
        offset + limit
      );


    const nextOffset =
      offset +
      desiredCollections.length;


    const hasMore =
      nextOffset <
      allCollections.length;


    console.log(
      "MARKTBLATT COLLECTION SYNC START:",
      {
        total:
          allCollections.length,

        offset,

        limit,

        batchSize:
          desiredCollections.length,

        nextOffset:
          hasMore
            ? nextOffset
            : null,

        publications:
          targetPublications.map(
            (publication) =>
              publication.name
          ),
      }
    );

    const created = [];
    const existing = [];
    const errors = [];


    /*
     * Collections bewusst nacheinander
     * verarbeiten.
     */

    for (
      const definition of
      desiredCollections
    ) {
      try {
        const existingCollection =
          await findCollectionByHandle(
            admin,
            definition.handle
          );


        /*
         * Bereits vorhandene Collection:
         *
         * Nicht neu erstellen.
         * Aber trotzdem sicherstellen,
         * dass sie auf den gewünschten
         * Kanälen veröffentlicht ist.
         */

        if (existingCollection) {
          const publishedChannels =
            await publishCollection(
              admin,
              existingCollection.id,
              targetPublications
            );


          existing.push({
            ...definition,

            shopifyCollectionId:
              existingCollection.id,

            shopifyTitle:
              existingCollection.title,

            publishedChannels,
          });


          console.log(
            "MARKTBLATT COLLECTION EXISTS:",
            {
              title:
                definition.title,

              handle:
                definition.handle,

              publishedChannels,
            }
          );

          continue;
        }


        /*
         * Neue Collection erstellen.
         */

        const collection =
          await createTagCollection(
            admin,
            definition
          );


        /*
         * Direkt danach auf den drei
         * gewünschten Kanälen veröffentlichen.
         */

        const publishedChannels =
          await publishCollection(
            admin,
            collection.id,
            targetPublications
          );


        created.push({
          ...definition,

          shopifyCollectionId:
            collection.id,

          publishedChannels,
        });


        console.log(
          "MARKTBLATT COLLECTION CREATED:",
          {
            title:
              definition.title,

            handle:
              definition.handle,

            tag:
              definition.tag,

            id:
              collection.id,

            publishedChannels,
          }
        );

      } catch (error) {
        const message =
          error?.message ||
          "Unbekannter Fehler";


        errors.push({
          ...definition,

          error:
            message,
        });


        console.error(
          "MARKTBLATT COLLECTION ERROR:",
          {
            title:
              definition.title,

            handle:
              definition.handle,

            tag:
              definition.tag,

            error:
              message,
          }
        );
      }
    }


return Response.json({
  success:
    errors.length === 0,

  total:
    allCollections.length,

  offset,

  limit,

  batchSize:
    desiredCollections.length,

  processedCount:
    created.length +
    existing.length +
    errors.length,

  nextOffset:
    hasMore
      ? nextOffset
      : null,

  hasMore,

  createdCount:
    created.length,

  existingCount:
    existing.length,

  errorCount:
    errors.length,

      publications:
        targetPublications.map(
          (publication) =>
            publication.name
        ),

      excludedVendor:
        EXCLUDED_VENDOR,

      created,
      existing,
      errors,
    });

  } catch (error) {
    console.error(
      "MARKTBLATT COLLECTION SYNC ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error?.message ||
          "Unbekannter Fehler",
      },
      {
        status: 500,
      }
    );
  }
}