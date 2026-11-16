
import db from "../db.server";
import { authenticate, unauthenticated } from "../shopify.server";

/*
 * Produkt eines authentifizierten Anbieters löschen.
 * Shopify wird zuerst gelöscht; PostgreSQL wird erst danach aktualisiert.
 */
export const action = async ({ request }) => {
  let cors = (response) => response;

  try {
    const authentication = await authenticate.public.customerAccount(request);
    cors = authentication.cors;

    const customerId = authentication.sessionToken?.sub ?? null;
    if (!customerId) {
      return cors(Response.json({ success: false, error: "Kunden-ID konnte nicht ermittelt werden." }, { status: 401 }));
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return cors(Response.json({ success: false, error: "Ungültige Anfrage." }, { status: 400 }));
    }

    const productId = body?.productId;
    if (typeof productId !== "string" || !productId.trim()) {
      return cors(Response.json({ success: false, error: "Produkt-ID fehlt." }, { status: 400 }));
    }

    const existingProduct = await db.marketplaceProduct.findFirst({
      where: {
        id: productId.trim(),
        customerId,
        status: { not: "deleted" },
      },
    });

    if (!existingProduct) {
      return cors(Response.json({ success: false, error: "Produkt wurde nicht gefunden." }, { status: 404 }));
    }

    if (existingProduct.shopifyProductId) {
      const marktblattShop = process.env.MARKTBLATT_SHOP;
      if (!marktblattShop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(marktblattShop)) {
        throw new Error("MARKTBLATT_SHOP ist nicht korrekt konfiguriert.");
      }

      const { admin } = await unauthenticated.admin(marktblattShop);
      const shopifyProductId = String(existingProduct.shopifyProductId);

      if (!/^gid:\/\/shopify\/Product\/\d+$/.test(shopifyProductId)) {
        throw new Error("Die gespeicherte Shopify-Produkt-ID ist ungültig. Bitte Support kontaktieren.");
      }

      // Vor der Löschung kontrollieren, ob die Shopify-Zuordnung noch stimmt.
      const verifyResponse = await admin.graphql(
        `#graphql
          query VerifyMarketplaceProductBeforeDelete($id: ID!) {
            product(id: $id) {
              id
              marketplaceProductId: metafield(namespace: "marktblatt", key: "marketplace_product_id") { value }
              marketplaceCustomerId: metafield(namespace: "marktblatt", key: "marketplace_customer_id") { value }
            }
          }
        `,
        { variables: { id: shopifyProductId } }
      );
      const verifyResult = await verifyResponse.json();
      if (verifyResult.errors?.length) {
        throw new Error(verifyResult.errors.map((item) => item.message).join(", "));
      }
      const shopifyProduct = verifyResult.data?.product;
      if (shopifyProduct) {
        if (
          shopifyProduct.marketplaceProductId?.value !== String(existingProduct.id) ||
          shopifyProduct.marketplaceCustomerId?.value !== String(customerId)
        ) {
          throw new Error("Die Shopify-Produktzuordnung stimmt nicht überein. Bitte Support kontaktieren.");
        }

        const deleteResponse = await admin.graphql(
          `#graphql
            mutation DeleteMarketplaceProduct($input: ProductDeleteInput!) {
              productDelete(input: $input) {
                deletedProductId
                userErrors { field message }
              }
            }
          `,
          { variables: { input: { id: shopifyProductId } } }
        );
        const deleteResult = await deleteResponse.json();
        if (deleteResult.errors?.length) {
          throw new Error(deleteResult.errors.map((item) => item.message).join(", "));
        }
        const deletePayload = deleteResult.data?.productDelete;
        if (!deletePayload || deletePayload.userErrors?.length) {
          throw new Error(deletePayload?.userErrors?.map((item) => item.message).join(", ") || "Shopify konnte das Produkt nicht löschen.");
        }
        if (deletePayload.deletedProductId !== shopifyProductId) {
          throw new Error("Shopify hat die Produktlöschung nicht bestätigt.");
        }
      }
      // Falls das Shopify-Produkt bereits nicht mehr existiert, wird nur
      // der noch vorhandene PostgreSQL-Datensatz als gelöscht markiert.
    }

    const deletedProduct = await db.marketplaceProduct.update({
      where: { id: existingProduct.id },
      data: { status: "deleted" },
    });

    const usedProducts = await db.marketplaceProduct.count({
      where: { customerId, status: { not: "deleted" } },
    });
    const subscription = await db.subscription.findUnique({ where: { customerId } });
    const productLimit = subscription?.productLimit ?? 0;
    const availableProducts = Math.max(productLimit - usedProducts, 0);

    return cors(Response.json({
      success: true,
      message: "Produkt wurde erfolgreich gelöscht.",
      product: {
        id: deletedProduct.id,
        title: deletedProduct.title,
        status: deletedProduct.status,
        shopifyProductId: deletedProduct.shopifyProductId,
        shopifyVariantId: deletedProduct.shopifyVariantId,
        shopifyHandle: deletedProduct.shopifyHandle,
        updatedAt: deletedProduct.updatedAt,
      },
      package: { productLimit, usedProducts, availableProducts },
    }));
  } catch (error) {
    console.error("PRODUCT DELETE ERROR:", error);
    return cors(Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Produkt konnte nicht gelöscht werden.",
    }, { status: 500 }));
  }
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }
  return Response.json({ success: false, error: "Diese Schnittstelle erwartet eine POST-Anfrage." }, {
    status: 405,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
};
