import prisma from "../db.server";

/**
 * Prüft ausschließlich lesend, ob ein Anbieter
 * mindestens ein aktives Produkt besitzt, das
 * im Shopify-Onlineshop veröffentlicht ist.
 *
 * Der Shopify Admin GraphQL Client muss aus einer
 * authentifizierten Marktblatt-Admin-Sitzung stammen.
 *
 * Keine Shopify-Mutationen.
 * Keine Datenbankänderungen.
 */
export async function checkVendorOnlineStorePublication({
  customerId,
  admin,
}) {
  if (
    typeof customerId !== "string" ||
    !/^gid:\/\/shopify\/Customer\/[1-9]\d*$/.test(customerId)
  ) {
    throw new Error("Ungültige Anbieter-ID.");
  }

  if (!admin || typeof admin.graphql !== "function") {
    throw new Error("Shopify Admin GraphQL Client fehlt.");
  }

  const products = await prisma.marketplaceProduct.findMany({
    where: {
      customerId,
      status: "active",
      adminLocked: false,
      shopifyProductId: { not: null },
    },
    select: {
      shopifyProductId: true,
    },
  });

  const productIds = [
    ...new Set(
      products
        .map((product) => product.shopifyProductId)
        .filter(
          (id) =>
            typeof id === "string" &&
            /^gid:\/\/shopify\/Product\/[1-9]\d*$/.test(id)
        )
    ),
  ];

  if (productIds.length === 0) {
    return {
      eligible: false,
      reason: "no_active_products",
      checkedProducts: 0,
    };
  }

  const publicationResponse = await admin.graphql(
    `#graphql
      query MarktblattAdsOnlineStorePublication {
        publications(first: 100) {
          nodes {
            id
            name
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `
  );

  const publicationData = await publicationResponse.json();

  if (publicationData.errors?.length) {
    throw new Error("Shopify-Vertriebskanäle konnten nicht geprüft werden.");
  }

  const publicationConnection = publicationData.data?.publications;

  if (
    !publicationConnection ||
    publicationConnection.pageInfo?.hasNextPage
  ) {
    throw new Error("Shopify-Vertriebskanalliste ist unvollständig.");
  }

  const onlineStores = publicationConnection.nodes.filter(
    (publication) =>
      ["onlineshop", "online store"].includes(
        String(publication.name ?? "").trim().toLowerCase()
      )
  );

  if (onlineStores.length !== 1) {
    throw new Error(
      "Shopify-Onlineshop-Vertriebskanal nicht eindeutig gefunden."
    );
  }

  const onlineStoreId = onlineStores[0].id;

  for (let offset = 0; offset < productIds.length; offset += 50) {
    const batch = productIds.slice(offset, offset + 50);

    const response = await admin.graphql(
      `#graphql
        query MarktblattAdsProductPublication($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              status
              resourcePublications(first: 100) {
                nodes {
                  publication {
                    id
                  }
                }
                pageInfo {
                  hasNextPage
                }
              }
            }
          }
        }
      `,
      {
        variables: {
          ids: batch,
        },
      }
    );

    const data = await response.json();

    if (data.errors?.length || !Array.isArray(data.data?.nodes)) {
      throw new Error(
        "Shopify-Produktveröffentlichungen konnten nicht geprüft werden."
      );
    }

    if (data.data.nodes.length !== batch.length) {
      throw new Error("Shopify-Produktantwort ist unvollständig.");
    }

    for (const product of data.data.nodes) {
      if (
        !product ||
        !product.id ||
        !product.resourcePublications ||
        product.resourcePublications.pageInfo?.hasNextPage
      ) {
        throw new Error(
          "Shopify-Produktveröffentlichung konnte nicht vollständig geprüft werden."
        );
      }

      if (
        product.status === "ACTIVE" &&
        product.resourcePublications.nodes.some(
          (entry) => entry.publication?.id === onlineStoreId
        )
      ) {
        return {
          eligible: true,
          reason: "online_store_published",
          checkedProducts: offset + batch.length,
          shopifyProductId: product.id,
        };
      }
    }
  }

  return {
    eligible: false,
    reason: "no_online_store_publication",
    checkedProducts: productIds.length,
  };
}