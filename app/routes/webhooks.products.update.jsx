import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * =========================================================
 * SHOPIFY PRODUCT UPDATE WEBHOOK
 * =========================================================
 *
 * Unterscheidet zwischen:
 *
 * 1. Statusänderung durch die Anbieter-App
 *    -> keine Admin-Sperre
 *
 * 2. Manuelle Deaktivierung im Shopify-Admin
 *    -> adminLocked = true
 *
 * 3. Manuelle Reaktivierung im Shopify-Admin
 *    -> adminLocked = false
 */

export const action = async ({ request }) => {
  const {
    shop,
    payload,
    topic,
  } = await authenticate.webhook(request);

  console.log(
    `Received ${topic} webhook for ${shop}`
  );

  /*
   * Nur Webhooks des echten Marktblatt-Shops
   * verarbeiten.
   */

  const marktblattShop =
    process.env.MARKTBLATT_SHOP;

  if (
    !marktblattShop ||
    shop !== marktblattShop
  ) {
    console.log(
      "PRODUCT UPDATE WEBHOOK: anderer Shop - ignoriert."
    );

    return new Response();
  }

  /*
   * Shopify liefert im REST-Webhook eine numerische
   * Produkt-ID. Unsere Datenbank speichert die GraphQL-GID.
   */

  const numericProductId =
    payload?.id;

  if (!numericProductId) {
    console.log(
      "PRODUCT UPDATE WEBHOOK: Produkt-ID fehlt."
    );

    return new Response();
  }

  const shopifyProductId =
    `gid://shopify/Product/${numericProductId}`;

  const product =
    await db.marketplaceProduct.findFirst({
      where: {
        shopifyProductId,

        status: {
          not: "deleted",
        },
      },
    });

  /*
   * Nicht jedes Shopify-Produkt stammt von Marktblatt.
   */

  if (!product) {
    return new Response();
  }

  const shopifyStatus =
    String(
      payload?.status || ""
    ).toLowerCase();

  /*
   * =======================================================
   * ÄNDERUNG DURCH DIE ANBIETER-APP
   * =======================================================
   *
   * api.product-status.jsx setzt vor der Shopify-Änderung
   * vendorStatusChangePending = true.
   *
   * Der Webhook verbraucht dieses Flag und setzt es wieder
   * zurück. Es entsteht KEINE Admin-Sperre.
   */

  if (product.vendorStatusChangePending) {
    await db.marketplaceProduct.update({
      where: {
        id: product.id,
      },

      data: {
        vendorStatusChangePending:
          false,
      },
    });

    console.log(
      `PRODUCT UPDATE WEBHOOK: Anbieter-Änderung für ${shopifyProductId} bestätigt.`
    );

    return new Response();
  }

  /*
   * =======================================================
   * MANUELLE DEAKTIVIERUNG DURCH MARKTBLATT
   * =======================================================
   *
   * ACTIVE -> DRAFT oder ARCHIVED
   *
   * Der Anbieter darf das Produkt danach nicht selbst
   * wieder aktivieren.
   */

  if (
    shopifyStatus === "draft" ||
    shopifyStatus === "archived"
  ) {
    await db.marketplaceProduct.update({
      where: {
        id: product.id,
      },

      data: {
        status: "inactive",
        adminLocked: true,
        vendorStatusChangePending:
          false,
      },
    });

    console.log(
      `PRODUCT UPDATE WEBHOOK: Produkt ${shopifyProductId} durch Marktblatt gesperrt.`
    );

    return new Response();
  }

  /*
   * =======================================================
   * MANUELLE REAKTIVIERUNG DURCH MARKTBLATT
   * =======================================================
   *
   * Wird das Produkt im Shopify-Admin wieder ACTIVE
   * geschaltet, wird die Admin-Sperre aufgehoben.
   */

  if (shopifyStatus === "active") {
    await db.marketplaceProduct.update({
      where: {
        id: product.id,
      },

      data: {
        status: "active",
        adminLocked: false,
        vendorStatusChangePending:
          false,
      },
    });

    console.log(
      `PRODUCT UPDATE WEBHOOK: Produkt ${shopifyProductId} durch Marktblatt freigegeben.`
    );
  }

  return new Response();
};
