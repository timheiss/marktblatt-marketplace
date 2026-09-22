import db from "../db.server";
import {
  authenticate,
  unauthenticated,
} from "../shopify.server";


/*
 * =========================================================
 * STREICHPREISE AKTIVIEREN / DEAKTIVIEREN
 * =========================================================
 */

export const action = async ({ request }) => {
  let cors = (response) => response;

  try {
    /*
     * KUNDEN AUTHENTIFIZIEREN
     */

    const authentication =
      await authenticate.public.customerAccount(
        request
      );

    cors = authentication.cors;

    const customerId =
      authentication.sessionToken?.sub ??
      null;

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
     * REQUEST
     */

    const body =
      await request.json();

    const enabled =
      body?.enabled;

    if (typeof enabled !== "boolean") {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Ungültige Streichpreis-Einstellung.",
          },
          {
            status: 400,
          }
        )
      );
    }


    /*
     * ABONNEMENT AKTUALISIEREN
     */

    const subscription =
      await db.subscription.findUnique({
        where: {
          customerId,
        },
      });

    if (!subscription) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Für diesen Anbieter wurde kein Marktblatt-Paket gefunden.",
          },
          {
            status: 404,
          }
        )
      );
    }

/*
 * =========================================================
 * BEREITS ÜBERTRAGENE PRODUKTE SYNCHRONISIEREN
 * =========================================================
 */

const products =
  await db.marketplaceProduct.findMany({
    where: {
      customerId,

      status: {
        not: "deleted",
      },

      shopifyProductId: {
        not: null,
      },

      shopifyVariantId: {
        not: null,
      },
    },
  });

const marktblattShop =
  process.env.MARKTBLATT_SHOP;

if (!marktblattShop) {
  throw new Error(
    "MARKTBLATT_SHOP ist auf dem Server nicht konfiguriert."
  );
}

const { admin } =
  await unauthenticated.admin(
    marktblattShop
  );

for (const product of products) {
  let compareAtPrice = null;

  if (
    enabled &&
    product.compareAtPrice &&
    product.price &&
    Number(product.compareAtPrice) >
      Number(product.price)
  ) {
    compareAtPrice =
      String(
        product.compareAtPrice
      ).trim();
  }

  const response =
    await admin.graphql(
      `#graphql
        mutation UpdateCompareAtPrice(
          $productId: ID!
          $variants: [ProductVariantsBulkInput!]!
        ) {
          productVariantsBulkUpdate(
            productId: $productId
            variants: $variants
          ) {
            productVariants {
              id
              compareAtPrice
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
          productId:
            product.shopifyProductId,

          variants: [
            {
              id:
                product.shopifyVariantId,

              compareAtPrice,
            },
          ],
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

  const userErrors =
    result?.data
      ?.productVariantsBulkUpdate
      ?.userErrors || [];

  if (userErrors.length > 0) {
    throw new Error(
      userErrors
        .map((item) => item.message)
        .join(", ")
    );
  }
}

    const updatedSubscription =
      await db.subscription.update({
        where: {
          customerId,
        },

        data: {
          compareAtPricesEnabled:
            enabled,
        },
      });


    return cors(
      Response.json({
        success: true,

        compareAtPricesEnabled:
          updatedSubscription
            .compareAtPricesEnabled,
      })
    );

  } catch (error) {
    console.error(
      "COMPARE AT PRICE SETTING ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,
          error:
            "Die Streichpreis-Einstellung konnte nicht gespeichert werden.",
        },
        {
          status: 500,
        }
      )
    );
  }
};