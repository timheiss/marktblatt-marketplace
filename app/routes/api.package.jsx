import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * =========================================================
 * MARKTBLATT PAKETE
 * =========================================================
 */

const PACKAGES = {
  starter: {
    name: "Starter",
    limit: 10,
    rank: 1,
  },

  business: {
    name: "Business",
    limit: 100,
    rank: 2,
  },

  professional: {
    name: "Professional",
    limit: 250,
    rank: 3,
  },

  enterprise: {
    name: "Enterprise",
    limit: 600,
    rank: 4,
  },
};


/*
 * =========================================================
 * PAKET ERKENNEN
 * =========================================================
 */

function detectPackage(lineItemName = "") {
  const name =
    String(lineItemName).toLowerCase();

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


/*
 * =========================================================
 * API
 * =========================================================
 */

export const loader = async ({ request }) => {
  try {

    /*
     * =====================================================
     * SHOPIFY ADMIN AUTHENTIFIZIEREN
     * =====================================================
     */

    const { admin } =
      await authenticate.admin(request);


    /*
     * =====================================================
     * BESTELLUNGEN LADEN
     * =====================================================
     */

    const response =
      await admin.graphql(`
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


    const result =
      await response.json();


    if (result.errors) {
      return Response.json(
        {
          success: false,
          error:
            "Shopify GraphQL Fehler",
          details:
            result.errors,
        },
        {
          status: 500,
        }
      );
    }


    const orders =
      result.data?.orders?.nodes ?? [];


    /*
     * =====================================================
     * GEFUNDENE PAKETBESTELLUNGEN
     * =====================================================
     */

    const subscriptions = [];


    /*
     * =====================================================
     * BESTES AKTIVES PAKET PRO KUNDE
     * =====================================================
     *
     * Ein Kunde kann nur ein aktives Marktblatt-Paket
     * besitzen.
     *
     * Ein höheres Paket darf ein niedrigeres ersetzen.
     * Ein niedrigeres Paket darf ein höheres NICHT
     * überschreiben.
     */

    const bestPackageByCustomer =
      new Map();


    for (const order of orders) {

      /*
       * Nur bezahlte Bestellungen berücksichtigen.
       */

      if (
        order.displayFinancialStatus !==
        "PAID"
      ) {
        continue;
      }


      for (
        const item of
        order.lineItems?.nodes ?? []
      ) {

        const packageInfo =
          detectPackage(
            `${item.name ?? ""} ${
              item.product?.title ?? ""
            }`
          );


        if (!packageInfo) {
          continue;
        }


        const customerId =
          order.customer?.id ?? null;


        if (!customerId) {
          continue;
        }


        const packageOrder = {
          orderId:
            order.id,

          orderName:
            order.name,

          createdAt:
            order.createdAt,

          financialStatus:
            order.displayFinancialStatus,

          customer: {
            id:
              customerId,

            name:
              order.customer?.displayName ??
              null,

            email:
              order.customer?.email ??
              order.email ??
              null,
          },

          package:
            packageInfo.name,

          productLimit:
            packageInfo.limit,

          rank:
            packageInfo.rank,

          product: {
            id:
              item.product?.id ??
              null,

            title:
              item.product?.title ??
              item.name,
          },

          variant: {
            id:
              item.variant?.id ??
              null,

            title:
              item.variant?.title ??
              null,
          },
        };


        subscriptions.push(
          packageOrder
        );


        const existing =
          bestPackageByCustomer.get(
            customerId
          );


        /*
         * Noch kein Paket:
         * Paket übernehmen.
         */

        if (!existing) {
          bestPackageByCustomer.set(
            customerId,
            packageOrder
          );

          continue;
        }


        /*
         * Nur ein echtes Upgrade darf das
         * vorhandene Paket ersetzen.
         */

        if (
          packageOrder.rank >
          existing.rank
        ) {
          bestPackageByCustomer.set(
            customerId,
            packageOrder
          );
        }
      }
    }


    /*
     * =====================================================
     * SUBSCRIPTIONS IN POSTGRESQL SPEICHERN
     * =====================================================
     */

    const synchronizedSubscriptions =
      [];


    for (
      const [
        customerId,
        selectedPackage,
      ] of bestPackageByCustomer.entries()
    ) {

      const savedSubscription =
        await db.subscription.upsert({
          where: {
            customerId,
          },

          create: {
            customerId,

            customerEmail:
              selectedPackage.customer
                .email,

            package:
              selectedPackage.package,

            productLimit:
              selectedPackage.productLimit,

            status:
              "active",

            currentPeriodStart:
              selectedPackage.createdAt
                ? new Date(
                    selectedPackage.createdAt
                  )
                : null,

            currentPeriodEnd:
              null,
          },

          update: {
            customerEmail:
              selectedPackage.customer
                .email,

            package:
              selectedPackage.package,

            productLimit:
              selectedPackage.productLimit,

            status:
              "active",

            currentPeriodStart:
              selectedPackage.createdAt
                ? new Date(
                    selectedPackage.createdAt
                  )
                : null,
          },
        });


      synchronizedSubscriptions.push({
        customerId:
          savedSubscription.customerId,

        package:
          savedSubscription.package,

        productLimit:
          savedSubscription.productLimit,

        status:
          savedSubscription.status,
      });
    }


    /*
     * =====================================================
     * ERGEBNIS
     * =====================================================
     */

    return Response.json({
      success: true,

      subscriptionsFound:
        subscriptions.length,

      subscriptions,

      synchronized:
        synchronizedSubscriptions.length,

      synchronizedSubscriptions,
    });

  } catch (error) {

    console.error(
      "Package API error:",
      error
    );


    return Response.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
};