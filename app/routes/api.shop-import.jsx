import db from "../db.server";
import { authenticate } from "../shopify.server";
import { saveMarketplaceProduct } from "../services/product-save.server";

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  return Response.json(
    { success: false, error: "Methode nicht erlaubt." },
    { status: 405 }
  );
};

export const action = async ({ request }) => {
  let cors = (response) => response;

  try {
    const auth = await authenticate.public.customerAccount(request);
    cors = auth.cors;

    const customerId = auth.sessionToken?.sub;

    if (!customerId) {
      return cors(Response.json(
        { success: false, error: "Nicht angemeldet." },
        { status: 401 }
      ));
    }

    const subscription = await db.subscription.findUnique({
      where: { customerId },
    });

    const allowedPackages = [
      "business",
      "professional",
      "enterprise",
    ];

    if (
      subscription?.status?.toLowerCase() !== "active" ||
      !allowedPackages.includes(
        subscription?.package?.trim().toLowerCase()
      )
    ) {
      return cors(Response.json(
        {
          success: false,
          error: "Der automatische Shop-Import ist erst ab Business verfügbar.",
        },
        { status: 403 }
      ));
    }

        const result = await saveMarketplaceProduct({
      request,
      customerId,
      requireShopImportPackage: true,
    });

    return cors(result);

  } catch (error) {
    console.error("SHOP IMPORT ERROR:", error);

    return cors(Response.json(
      {
        success: false,
        error: "Der Shop-Import konnte nicht verarbeitet werden.",
      },
      { status: 500 }
    ));
  }
};
