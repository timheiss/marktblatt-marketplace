import db from "../db.server";
import {
  authenticate,
  unauthenticated,
} from "../shopify.server";

/*
 * =========================================================
 * PRODUKTSTATUS ÄNDERN
 * =========================================================
 *
 * active:
 * - nur möglich, wenn keine Marktblatt-Admin-Sperre besteht
 * - Shopify-Produkt -> ACTIVE
 * - Veröffentlichung auf den gewünschten Vertriebskanälen
 *
 * inactive:
 * - Shopify-Produkt -> DRAFT
 * - Änderung wird als Anbieter-Änderung markiert
 */

const TARGET_PUBLICATIONS = [
  "onlineshop",
  "online store",
  "google & youtube",
  "facebook & instagram",
];

function normalizePublicationName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export const action = async ({ request }) => {
  let cors = (response) => response;

  try {
    /*
     * =====================================================
     * 1. SHOPIFY-KUNDEN AUTHENTIFIZIEREN
     * =====================================================
     */

    const authentication =
      await authenticate.public.customerAccount(request);

    cors = authentication.cors;

    const sessionToken =
      authentication.sessionToken;

    const customerId =
      sessionToken?.sub ?? null;

    if (!customerId) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Kunden-ID konnte nicht ermittelt werden.",
          },
          {
            status: 401,
          }
        )
      );
    }

    /*
     * =====================================================
     * 2. REQUEST-DATEN
     * =====================================================
     */

    const body =
      await request.json();

    const productId =
      body?.productId;

    const requestedStatus =
      body?.status;

    if (!productId) {
      return cors(
        Response.json(
          {
            success: false,
            error: "Produkt-ID fehlt.",
          },
          {
            status: 400,
          }
        )
      );
    }

    if (
      requestedStatus !== "active" &&
      requestedStatus !== "inactive"
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Ungültiger Produktstatus.",
          },
          {
            status: 400,
          }
        )
      );
    }

    /*
     * =====================================================
     * 3. PRODUKT SUCHEN
     * =====================================================
     */

    const existingProduct =
      await db.marketplaceProduct.findFirst({
        where: {
          id: String(productId),
          customerId,

          status: {
            not: "deleted",
          },
        },
      });

    if (!existingProduct) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Produkt wurde nicht gefunden.",
          },
          {
            status: 404,
          }
        )
      );
    }

    /*
     * =====================================================
     * 4. MARKTBLATT-ADMIN-SPERRE
     * =====================================================
     *
     * Ein durch Marktblatt gesperrtes Produkt darf vom
     * Anbieter nicht wieder aktiviert werden.
     */

    if (
      requestedStatus === "active" &&
      existingProduct.adminLocked
    ) {
      return cors(
        Response.json(
          {
            success: false,
            adminLocked: true,
            error:
              "Dieses Produkt kann nur durch Marktblatt wieder aktiviert werden. Bitte Support kontaktieren.",
          },
          {
            status: 403,
          }
        )
      );
    }

    /*
     * =====================================================
     * 5. AKTIVIEREN ERST NACH ÜBERTRAGUNG
     * =====================================================
     */

    if (
      requestedStatus === "active" &&
      !existingProduct.shopifyProductId
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Das Produkt muss zuerst an Marktblatt übertragen werden.",
          },
          {
            status: 400,
          }
        )
      );
    }

    /*
     * =====================================================
     * 6. SHOPIFY-PRODUKT SYNCHRONISIEREN
     * =====================================================
     */

    let publishedChannels = [];
    let missingChannels = [];

    if (existingProduct.shopifyProductId) {
      const marktblattShop =
        process.env.MARKTBLATT_SHOP;

      if (!marktblattShop) {
        throw new Error(
          "MARKTBLATT_SHOP ist auf dem Server nicht konfiguriert."
        );
      }

      if (
        !marktblattShop.endsWith(
          ".myshopify.com"
        )
      ) {
        throw new Error(
          "MARKTBLATT_SHOP enthält keine gültige Shopify-Shop-Domain."
        );
      }

      const { admin } =
        await unauthenticated.admin(
          marktblattShop
        );

      /*
       * ===================================================
       * 6A. ANBIETER-STATUSÄNDERUNG MARKIEREN
       * ===================================================
       *
       * Der products/update-Webhook wird später anhand
       * dieses Feldes erkennen, dass die Änderung von
       * unserer Anbieter-App ausgelöst wurde.
       */

      await db.marketplaceProduct.update({
        where: {
          id: existingProduct.id,
        },

        data: {
          vendorStatusChangePending: true,
        },
      });

      try {
        /*
         * =================================================
         * 6B. SHOPIFY STATUS ÄNDERN
         * =================================================
         */

        const shopifyStatus =
          requestedStatus === "active"
            ? "ACTIVE"
            : "DRAFT";

        const shopifyResponse =
          await admin.graphql(
            `#graphql
              mutation ProductStatusUpdate(
                $product: ProductUpdateInput!
              ) {
                productUpdate(product: $product) {
                  product {
                    id
                    status
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
                product: {
                  id:
                    existingProduct.shopifyProductId,

                  status:
                    shopifyStatus,
                },
              },
            }
          );

        const shopifyData =
          await shopifyResponse.json();

        const userErrors =
          shopifyData?.data
            ?.productUpdate
            ?.userErrors ?? [];

        if (userErrors.length > 0) {
          throw new Error(
            userErrors
              .map(
                (error) =>
                  error.message
              )
              .join(" ")
          );
        }

        const changedShopifyProduct =
          shopifyData?.data
            ?.productUpdate
            ?.product;

        if (!changedShopifyProduct?.id) {
          throw new Error(
            "Der Produktstatus konnte bei Shopify nicht geändert werden."
          );
        }

        /*
         * =================================================
         * 6C. BEIM AKTIVIEREN PUBLICATIONS LADEN
         * =================================================
         */

        if (requestedStatus === "active") {
          const publicationsResponse =
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

          const publicationsData =
            await publicationsResponse.json();

          if (
            publicationsData?.errors?.length
          ) {
            throw new Error(
              publicationsData.errors
                .map(
                  (error) =>
                    error.message
                )
                .join(" ")
            );
          }

          const publications =
            publicationsData?.data
              ?.publications
              ?.nodes ?? [];

          /*
           * Nur die von uns gewünschten Kanäle.
           *
           * Point of Sale und Shop werden ausdrücklich
           * NICHT automatisch verwendet.
           */

          const targetPublications =
            publications.filter(
              (publication) =>
                TARGET_PUBLICATIONS.includes(
                  normalizePublicationName(
                    publication.name
                  )
                )
            );

          publishedChannels =
            targetPublications.map(
              (publication) =>
                publication.name
            );

          /*
           * Prüfen, welche gewünschten Kanäle im
           * echten Marktblatt-Shop noch fehlen.
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

          const desiredChannelGroups = [
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
              label:
                "Facebook & Instagram",
              aliases: [
                "facebook & instagram",
              ],
            },
          ];

          missingChannels =
            desiredChannelGroups
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

          /*
           * =================================================
           * 6D. PRODUKT AUF PUBLICATIONS VERÖFFENTLICHEN
           * =================================================
           */

          if (
            targetPublications.length > 0
          ) {
            const publicationInputs =
              targetPublications.map(
                (publication) => ({
                  publicationId:
                    publication.id,
                })
              );

            const publishResponse =
              await admin.graphql(
                `#graphql
                  mutation PublishProduct(
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
                      existingProduct.shopifyProductId,

                    input:
                      publicationInputs,
                  },
                }
              );

            const publishData =
              await publishResponse.json();

            if (
              publishData?.errors?.length
            ) {
              throw new Error(
                publishData.errors
                  .map(
                    (error) =>
                      error.message
                  )
                  .join(" ")
              );
            }

            const publishErrors =
              publishData?.data
                ?.publishablePublish
                ?.userErrors ?? [];

            if (
              publishErrors.length > 0
            ) {
              throw new Error(
                publishErrors
                  .map(
                    (error) =>
                      error.message
                  )
                  .join(" ")
              );
            }
          }
        }

        /*
         * =================================================
         * 6E. MARKTBLATT-DATENBANK AKTUALISIEREN
         * =================================================
         */

        const updatedProduct =
          await db.marketplaceProduct.update({
            where: {
              id:
                existingProduct.id,
            },

            data: {
              status:
                requestedStatus,

              /*
               * Bei normaler Anbietersteuerung bleibt
               * die Admin-Sperre unverändert false.
               */
              adminLocked: false,

              /*
               * WICHTIG:
               * Dieses Feld bleibt zunächst TRUE.
               *
               * Der products/update-Webhook wird es
               * zurücksetzen. Dadurch weiß der Webhook,
               * dass die Shopify-Änderung von unserer
               * App und nicht vom Marktblatt-Admin kam.
               */
              vendorStatusChangePending:
                true,
            },
          });

        return cors(
          Response.json({
            success: true,

            message:
              requestedStatus === "active"
                ? "Produkt wurde aktiviert und auf Marktblatt veröffentlicht."
                : "Produkt wurde deaktiviert und auf Marktblatt ausgeblendet.",

            publishedChannels,

            missingChannels,

            product: {
              id:
                updatedProduct.id,

              title:
                updatedProduct.title,

              status:
                updatedProduct.status,

              adminLocked:
                updatedProduct.adminLocked,

              shopifyProductId:
                updatedProduct.shopifyProductId,

              shopifyVariantId:
                updatedProduct.shopifyVariantId,

              shopifyHandle:
                updatedProduct.shopifyHandle,

              updatedAt:
                updatedProduct.updatedAt,
            },
          })
        );
      } catch (error) {
        /*
         * Falls Shopify fehlschlägt, darf kein
         * veraltetes Pending-Flag übrig bleiben.
         */

        await db.marketplaceProduct.update({
          where: {
            id: existingProduct.id,
          },

          data: {
            vendorStatusChangePending:
              false,
          },
        });

        throw error;
      }
    }

    /*
     * =====================================================
     * FALL OHNE SHOPIFY-PRODUKT
     * =====================================================
     */

    const updatedProduct =
      await db.marketplaceProduct.update({
        where: {
          id: existingProduct.id,
        },

        data: {
          status:
            requestedStatus,

          adminLocked: false,

          vendorStatusChangePending:
            false,
        },
      });

    return cors(
      Response.json({
        success: true,

        message:
          requestedStatus === "active"
            ? "Produkt wurde aktiviert."
            : "Produkt wurde deaktiviert.",

        product: {
          id:
            updatedProduct.id,

          title:
            updatedProduct.title,

          status:
            updatedProduct.status,

          adminLocked:
            updatedProduct.adminLocked,

          shopifyProductId:
            updatedProduct.shopifyProductId,

          shopifyVariantId:
            updatedProduct.shopifyVariantId,

          shopifyHandle:
            updatedProduct.shopifyHandle,

          updatedAt:
            updatedProduct.updatedAt,
        },
      })
    );
  } catch (error) {
    console.error(
      "PRODUCT STATUS ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,

          error:
            error instanceof Error
              ? error.message
              : "Produktstatus konnte nicht geändert werden.",
        },
        {
          status: 500,
        }
      )
    );
  }
};

/*
 * =========================================================
 * OPTIONS / GET
 * =========================================================
 */

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,

      headers: {
        "Access-Control-Allow-Origin":
          "*",

        "Access-Control-Allow-Methods":
          "POST, OPTIONS",

        "Access-Control-Allow-Headers":
          "Authorization, Content-Type",
      },
    });
  }

  return Response.json(
    {
      success: false,

      error:
        "Diese Schnittstelle erwartet eine POST-Anfrage.",
    },
    {
      status: 405,

      headers: {
        "Access-Control-Allow-Origin":
          "*",
      },
    }
  );
};