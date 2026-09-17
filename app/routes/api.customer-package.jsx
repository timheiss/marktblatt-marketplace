import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * =========================================================
 * CUSTOMER ACCOUNT - PAKETINFORMATIONEN
 * =========================================================
 *
 * Dieser Endpunkt wird von der Shopify Customer Account
 * Extension aufgerufen.
 *
 * Shopify authentifiziert den eingeloggten Kunden über
 * den Customer Account Session Token.
 */

export async function loader({ request }) {
  try {
    /*
     * =====================================================
     * SHOPIFY CUSTOMER AUTHENTIFIZIEREN
     * =====================================================
     */

    const { sessionToken, cors } =
      await authenticate.public.customerAccount(request);

    const customerId =
      sessionToken?.sub ?? null;

    const shop =
      sessionToken?.dest ?? null;

    if (!customerId) {
      return cors(
        Response.json(
          {
            success: false,
            error: "Kunden-ID konnte nicht ermittelt werden.",
          },
          {
            status: 401,
          }
        )
      );
    }

    /*
     * =====================================================
     * PAKET AUS DATENBANK LADEN
     * =====================================================
     */

    const subscription =
      await db.subscription.findUnique({
        where: {
          customerId,
        },
      });

    /*
     * =====================================================
     * NOCH KEIN PAKET
     * =====================================================
     */

    if (!subscription) {
      return cors(
        Response.json({
          success: true,

          customerId,
          shop,

          hasSubscription: false,

          subscription: null,

          usedProducts: 0,
          productLimit: 0,
          availableProducts: 0,
        })
      );
    }

    /*
     * =====================================================
     * VERWENDETE PRODUKTE ZÄHLEN
     * =====================================================
     */

    const usedProducts =
      await db.marketplaceProduct.count({
        where: {
          customerId,

          status: {
            not: "deleted",
          },
        },
      });

    const availableProducts =
      Math.max(
        subscription.productLimit - usedProducts,
        0
      );

    /*
     * =====================================================
     * ERFOLGREICHE ANTWORT
     * =====================================================
     */

    return cors(
      Response.json({
        success: true,

        customerId,
        shop,

        hasSubscription: true,

        subscription: {
          package:
            subscription.package,

          status:
            subscription.status,

          productLimit:
            subscription.productLimit,

          currentPeriodStart:
            subscription.currentPeriodStart,

          currentPeriodEnd:
            subscription.currentPeriodEnd,
        },

        usedProducts,

        productLimit:
          subscription.productLimit,

        availableProducts,
      })
    );

  } catch (error) {
    console.error(
      "CUSTOMER PACKAGE ERROR:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Kundenpaket konnte nicht geladen werden.",
      },
      {
        status: 401,

        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }
}