import db from "../db.server";
import sanitizeHtml from "sanitize-html";
import { getVerifiedVendorShop, assertVerifiedShopDomain } from "../services/vendor-shop-domain.server";
import { secureDownloadHtml } from "../services/secure-product-fetch.server";
import { extractProduct } from "../services/product-extraction.server";
import {
  authenticate,
  unauthenticated,
} from "../shopify.server";

export const action = async ({ request }) => {
  let cors = (response) => response;
  let shopifyChangesStarted = false;

  try {
    const authentication =
      await authenticate.public.customerAccount(request);

    cors = authentication.cors;

    const customerId =
      authentication.sessionToken?.sub ?? null;

    if (!customerId) {
      return cors(Response.json({
        success: false,
        error: "Kunden-ID konnte nicht ermittelt werden.",
      }, { status: 401 }));
    }

    const body = await request.json();
    const productId = body?.productId;

    if (
      typeof productId !== "string" ||
      !productId.trim()
    ) {
      return cors(Response.json({
        success: false,
        error: "Gültige Produkt-ID fehlt.",
      }, { status: 400 }));
    }

    const product = await db.marketplaceProduct.findFirst({
      where: {
        id: productId.trim(),
        customerId,
        status: { not: "deleted" },
      },
    });

    if (!product) {
      return cors(Response.json({
        success: false,
        error: "Produkt nicht gefunden oder keine Berechtigung.",
      }, { status: 404 }));
    }

    const subscription = await db.subscription.findUnique({
      where: { customerId },
    });

    if (subscription?.status !== "active") {
      return cors(Response.json({
        success: false,
        error: "Kein aktives Marktblatt-Paket vorhanden.",
      }, { status: 403 }));
    }

    if (!product.sourceUrl) {
      return cors(Response.json({
        success: false,
        error: "Für dieses Produkt ist keine Original-URL hinterlegt.",
      }, { status: 400 }));
    }

    const verifiedShop = await getVerifiedVendorShop(customerId);

    assertVerifiedShopDomain(
      product.sourceUrl,
      verifiedShop.shopUrl
    );

    const { html, finalUrl } = await secureDownloadHtml(
      product.sourceUrl,
      verifiedShop.shopUrl
    );

    const refreshedProduct = extractProduct(html, finalUrl);

    if (!refreshedProduct?.title) {
      return cors(Response.json({
        success: false,
        error: "Die Originalseite enthält keine eindeutigen Produktdaten.",
      }, { status: 422 }));
    }

    const updateData = {};

    const fields = [
      "title",
      "description",
      "descriptionHtml",
      "metaTitle",
      "metaDescription",
      "price",
      "currency",
      "brand",
      "sku",
      "gtin",
      "mpn",
      "productType",
      "material",
      "color",
      "size",
      "condition",
      "gender",
      "ageGroup",
      "adult",
      "itemGroupId",
      "category",
      "compareAtPrice",
      "compareAtPriceSource",
    ];

    for (const field of fields) {
      const value = refreshedProduct[field];

      if (value !== undefined && value !== null && value !== "") {
        updateData[field] = value;
      }
    }

    // Bilder veröffentlichter Produkte erst nach erfolgreicher
    // Mediensynchronisierung aktualisieren.
    if (
      !product.shopifyProductId &&
      Array.isArray(refreshedProduct.images) &&
      refreshedProduct.images.length > 0
    ) {
      updateData.images = JSON.stringify(refreshedProduct.images);
    }

    if (product.shopifyProductId) {
      const destination = authentication.sessionToken?.dest;

      if (!destination) {
        return cors(Response.json({
          success: false,
          error: "Verbindung zu Marktblatt fehlgeschlagen.",
        }, { status: 401 }));
      }

      const shopUrl = new URL(destination);

      if (
        shopUrl.protocol !== "https:" ||
        !shopUrl.hostname.endsWith(".myshopify.com")
      ) {
        return cors(Response.json({
          success: false,
          error: "Ungültige Shop-Verbindung.",
        }, { status: 403 }));
      }

      const configuredShop = String(
        process.env.MARKTBLATT_SHOP || ""
      ).trim().toLowerCase();

      if (
        !configuredShop ||
        !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(configuredShop) ||
        shopUrl.hostname !== configuredShop
      ) {
        return cors(Response.json({
          success: false,
          error: "Ungültige Shop-Verbindung.",
        }, { status: 403 }));
      }

      const offlineSession = await db.session.findFirst({
        where: {
          shop: shopUrl.hostname,
          isOnline: false,
        },
        select: {
          id: true,
          shop: true,
        },
      });

      if (!offlineSession) {
        return cors(Response.json({
          success: false,
          error: "Verbindung zu Marktblatt fehlgeschlagen.",
        }, { status: 403 }));
      }

      const { admin } = await unauthenticated.admin(
        offlineSession.shop
      );

      const descriptionHtml = refreshedProduct.descriptionHtml
        ? sanitizeHtml(refreshedProduct.descriptionHtml, {
            allowedTags: [
              "p", "br", "strong", "b", "em", "i", "u",
              "h2", "h3", "h4", "ul", "ol", "li", "blockquote"
            ],
            allowedAttributes: {},
            disallowedTagsMode: "discard",
          })
        : refreshedProduct.description
          ? `<p>${String(refreshedProduct.description)
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")
              .replaceAll('"', "&quot;")
              .replaceAll("'", "&#039;")}</p>`
          : null;

      const shopifyUpdate = {
        id: product.shopifyProductId,
        ...(refreshedProduct.title
          ? { title: refreshedProduct.title }
          : {}),
        ...(descriptionHtml
          ? { descriptionHtml }
          : {}),
        ...(refreshedProduct.metaTitle || refreshedProduct.metaDescription
          ? {
              seo: {
                ...(refreshedProduct.metaTitle
                  ? { title: refreshedProduct.metaTitle }
                  : {}),
                ...(refreshedProduct.metaDescription
                  ? { description: refreshedProduct.metaDescription }
                  : {}),
              },
            }
          : {}),
      };

      // Vorhandene Shopify-Varianten eindeutig zuordnen.
      let variantsToUpdate = [];

      const storedVariants = Array.isArray(product.variants)
        ? product.variants
        : [];

      const sourceVariants = Array.isArray(refreshedProduct.variants)
        ? refreshedProduct.variants
        : [];

      if (storedVariants.length > 1) {
        if (sourceVariants.length !== storedVariants.length) {
          return cors(Response.json({
            success: false,
            error: "Die Variantenanzahl hat sich geändert. Aktualisierung abgebrochen.",
          }, { status: 409 }));
        }

        const optionNames = Array.isArray(product.options)
          ? product.options.map((option) => String(option.name))
          : [];

        if (optionNames.length === 0) {
          return cors(Response.json({
            success: false,
            error: "Gespeicherte Produktoptionen fehlen.",
          }, { status: 409 }));
        }

        const makeKey = (options) =>
          JSON.stringify(
            optionNames.map((name) => [
              name,
              String(options?.[name] ?? "").trim(),
            ])
          );

        // Gespeicherte Variantenkombinationen müssen eindeutig sein.
        const storedKeys = storedVariants.map(
          (variant) => makeKey(variant.options)
        );

        if (new Set(storedKeys).size !== storedKeys.length) {
          return cors(Response.json({
            success: false,
            error: "Doppelte Variantenkombination in den gespeicherten Produktdaten.",
          }, { status: 409 }));
        }

        const sourceByKey = new Map();

        for (const variant of sourceVariants) {
          const key = makeKey(variant.options);

          if (sourceByKey.has(key)) {
            return cors(Response.json({
              success: false,
              error: "Doppelte Variantenkombination in der Originalquelle.",
            }, { status: 409 }));
          }

          sourceByKey.set(key, variant);
        }

        variantsToUpdate = [];

        for (const storedVariant of storedVariants) {
          const key = makeKey(storedVariant.options);
          const sourceVariant = sourceByKey.get(key);

          if (!sourceVariant || !storedVariant.shopifyVariantId) {
            return cors(Response.json({
              success: false,
              error: "Eine Variante konnte nicht eindeutig zugeordnet werden.",
            }, { status: 409 }));
          }

          variantsToUpdate.push({
            ...sourceVariant,
            shopifyVariantId: storedVariant.shopifyVariantId,
          });
        }
      } else if (product.shopifyVariantId) {
        variantsToUpdate = [{
          shopifyVariantId: product.shopifyVariantId,
          price: refreshedProduct.price,
          image: sourceVariants.length === 1
            ? sourceVariants[0]?.image || null
            : null,
        }];
      }
      // Preise für bestehende Shopify-Varianten vorbereiten.
      const variantPriceUpdates = [];

      for (const variant of variantsToUpdate) {
        const rawPrice = variant.price;

        if (
          rawPrice === null ||
          rawPrice === undefined ||
          String(rawPrice).trim() === ""
        ) {
          return cors(Response.json({
            success: false,
            error: "Für mindestens eine Variante fehlt der aktuelle Preis.",
          }, { status: 422 }));
        }

        const normalizedPrice = String(rawPrice).trim();

        if (
          !/^\d+(\.\d{1,2})?$/.test(normalizedPrice) ||
          !Number.isFinite(Number(normalizedPrice)) ||
          Number(normalizedPrice) <= 0
        ) {
          return cors(Response.json({
            success: false,
            error: "Ein Variantenpreis hat ein ungültiges Format.",
          }, { status: 422 }));
        }

        const rawCompareAtPrice =
          subscription.compareAtPricesEnabled &&
          storedVariants.length <= 1
            ? refreshedProduct.compareAtPrice
            : null;

        let compareAtPrice = null;

        if (
          rawCompareAtPrice !== null &&
          rawCompareAtPrice !== undefined &&
          String(rawCompareAtPrice).trim() !== ""
        ) {
          const normalizedCompareAtPrice =
            String(rawCompareAtPrice).trim();

          if (
            /^\d+(\.\d{1,2})?$/.test(normalizedCompareAtPrice) &&
            Number.isFinite(Number(normalizedCompareAtPrice)) &&
            Number(normalizedCompareAtPrice) > Number(normalizedPrice)
          ) {
            compareAtPrice = normalizedCompareAtPrice;
          }
        }

        variantPriceUpdates.push({
          id: variant.shopifyVariantId,
          price: normalizedPrice,
          ...(storedVariants.length <= 1
            ? { compareAtPrice }
            : {}),
        });
      }
      // Shopify-Varianten vor der Synchronisierung prüfen.
      if (variantPriceUpdates.length === 0) {
        return cors(Response.json({
          success: false,
          productId: product.id,
          error: "Keine eindeutig zugeordnete Shopify-Variante vorhanden.",
        }, { status: 409 }));
      }

      const variantIds = variantPriceUpdates.map(
        (variant) => variant.id
      );

      if (
        variantIds.some((id) =>
          typeof id !== "string" ||
          !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(id)
        ) ||
        new Set(variantIds).size !== variantIds.length
      ) {
        return cors(Response.json({
          success: false,
          productId: product.id,
          error: "Varianten konnten nicht zugeordnet werden.",
        }, { status: 409 }));
      }
      // Shopify-Produkt und zugehörige Varianten prüfen.
      if (
        !/^gid:\/\/shopify\/Product\/\d+$/.test(
          String(product.shopifyProductId)
        )
      ) {
        return cors(Response.json({
          success: false,
          error: "Ungültige Produkt-ID.",
        }, { status: 409 }));
      }

      // Vorhandene Produkt- und Varianten-IDs prüfen, ohne Medien zu verändern.
      const verifyResponse = await admin.graphql(
        `#graphql
          query VerifyMarketplaceRefreshProduct($id: ID!) {
            product(id: $id) {
              id
              variants(first: 250) {
                nodes { id }
                pageInfo { hasNextPage }
              }
            }
          }
        `,
        { variables: { id: product.shopifyProductId } }
      );

      const verifyResult = await verifyResponse.json();
      if (verifyResult.errors?.length) {
        throw new Error("Produkt konnte nicht geprüft werden.");
      }

      const existingProduct = verifyResult.data?.product;
      if (
        !existingProduct ||
        existingProduct.id !== product.shopifyProductId ||
        existingProduct.variants?.pageInfo?.hasNextPage ||
        !Array.isArray(existingProduct.variants?.nodes)
      ) {
        return cors(Response.json({
          success: false,
          error: "Produkt konnte nicht vollständig geprüft werden.",
        }, { status: 409 }));
      }

      const existingVariantIds = existingProduct.variants.nodes.map(
        (variant) => variant.id
      );
      if (
        existingVariantIds.length !== variantIds.length ||
        new Set(existingVariantIds).size !== existingVariantIds.length ||
        variantIds.some((id) => !existingVariantIds.includes(id))
      ) {
        return cors(Response.json({
          success: false,
          error: "Varianten konnten nicht zugeordnet werden.",
        }, { status: 409 }));
      }

      shopifyChangesStarted = true;

      // Bestehendes Shopify-Produkt aktualisieren.
      const productResponse = await admin.graphql(
        `#graphql
          mutation RefreshMarketplaceProduct(
            $product: ProductUpdateInput!
          ) {
            productUpdate(product: $product) {
              product {
                id
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
            product: shopifyUpdate,
          },
        }
      );

      const productResult = await productResponse.json();

      if (productResult.errors?.length) {
        throw new Error(
          productResult.errors
            .map((error) => error.message)
            .join(", ")
        );
      }

      const productPayload = productResult.data?.productUpdate;

      if (
        !productPayload ||
        productPayload.userErrors?.length ||
        productPayload.product?.id !== product.shopifyProductId
      ) {
        throw new Error(
          productPayload?.userErrors
            ?.map((error) => error.message)
            .join(", ") ||
          "Produkt konnte nicht aktualisiert werden."
        );
      }

      // Preise bestehender Shopify-Varianten aktualisieren.
      const variantResponse = await admin.graphql(
        `#graphql
          mutation RefreshMarketplaceVariants(
            $productId: ID!
            $variants: [ProductVariantsBulkInput!]!
          ) {
            productVariantsBulkUpdate(
              productId: $productId
              variants: $variants
            ) {
              productVariants {
                id
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
            productId: product.shopifyProductId,
            variants: variantPriceUpdates,
          },
        }
      );

      const variantResult = await variantResponse.json();

      if (variantResult.errors?.length) {
        throw new Error(
          variantResult.errors
            .map((error) => error.message)
            .join(", ")
        );
      }

      const variantPayload =
        variantResult.data?.productVariantsBulkUpdate;

      if (
        !variantPayload ||
        variantPayload.userErrors?.length ||
        variantPayload.productVariants?.length !== variantPriceUpdates.length
      ) {
        throw new Error(
          variantPayload?.userErrors
            ?.map((error) => error.message)
            .join(", ") ||
          "Varianten konnten nicht aktualisiert werden."
        );
      }

      // Aktualisierte Variantenpreise für die Datenbank übernehmen.
      if (storedVariants.length > 1) {
        const refreshedPricesById = new Map(
          variantPriceUpdates.map((variant) => [
            variant.id,
            variant.price,
          ])
        );

        updateData.variants = storedVariants.map((variant) => ({
          ...variant,
          price: String(
            refreshedPricesById.get(variant.shopifyVariantId)
          ),
        }));
      }
    }

    const updatedProduct = await db.marketplaceProduct.update({
      where: {
        id: product.id,
        customerId,
      },
      data: updateData,
    });

    return cors(Response.json({
      success: true,
      productId: updatedProduct.id,
      message: "Produktdaten in Marktblatt aktualisiert.",
    }));

  } catch (error) {
    console.error("MARKTBLATT PRODUCT REFRESH ERROR:", error);

    return cors(Response.json({
      success: false,
      partialUpdatePossible: shopifyChangesStarted,
      error: shopifyChangesStarted
        ? "Aktualisierung unvollständig. Bitte erneut versuchen."
        : "Produkt konnte nicht aktualisiert werden.",
    }, { status: 500 }));
  }
};


