import { authenticate } from "../shopify.server";

const PACKAGES = {
  starter: {
    name: "Starter",
    limit: 10,
  },
  business: {
    name: "Business",
    limit: 100,
  },
  professional: {
    name: "Professional",
    limit: 250,
  },
  enterprise: {
    name: "Enterprise",
    limit: 600,
  },
};

function detectPackage(lineItemName = "") {
  const name = lineItemName.toLowerCase();

  if (name.includes("enterprise")) {
    return PACKAGES.enterprise;
  }

  if (name.includes("professional")) {
    return PACKAGES.professional;
  }

  if (name.includes("business")) {
    return PACKAGES.business;
  }

  if (name.includes("starter")) {
    return PACKAGES.starter;
  }

  return null;
}

export const loader = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);

    const response = await admin.graphql(`
      #graphql
      query PackageOrders {
        orders(
          first: 50
          reverse: true
          sortKey: CREATED_AT
        ) {
          nodes {
            id
            name
            createdAt
            displayFinancialStatus
            email

            customer {
              id
              email
              displayName
            }

            lineItems(first: 50) {
              nodes {
                id
                name
                quantity

                product {
                  id
                  title
                }

                variant {
                  id
                  title
                }
              }
            }
          }
        }
      }
    `);

    const result = await response.json();

    if (result.errors) {
      return Response.json(
        {
          success: false,
          error: "Shopify GraphQL Fehler",
          details: result.errors,
        },
        { status: 500 }
      );
    }

    const orders = result.data?.orders?.nodes ?? [];

    const subscriptions = [];

    for (const order of orders) {
      for (const item of order.lineItems.nodes) {
        const packageInfo = detectPackage(
          `${item.name ?? ""} ${item.product?.title ?? ""}`
        );

        if (!packageInfo) {
          continue;
        }

        subscriptions.push({
          orderId: order.id,
          orderName: order.name,
          createdAt: order.createdAt,
          financialStatus: order.displayFinancialStatus,

          customer: {
            id: order.customer?.id ?? null,
            name: order.customer?.displayName ?? null,
            email: order.customer?.email ?? order.email ?? null,
          },

          package: packageInfo.name,
          productLimit: packageInfo.limit,

          product: {
            id: item.product?.id ?? null,
            title: item.product?.title ?? item.name,
          },

          variant: {
            id: item.variant?.id ?? null,
            title: item.variant?.title ?? null,
          },
        });
      }
    }

    return Response.json({
      success: true,
      subscriptionsFound: subscriptions.length,
      subscriptions,
    });
  } catch (error) {
    console.error("Package API error:", error);

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
};
