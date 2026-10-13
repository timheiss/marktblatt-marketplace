import { authenticate } from "../shopify.server";
import { saveMarketplaceProduct } from "../services/product-save.server";

export const action = async ({ request }) => {
  let cors = (response) => response;

  try {
    const authentication =
      await authenticate.public.customerAccount(request);

    cors = authentication.cors;

    const customerId =
      authentication.sessionToken?.sub ?? null;

    if (!customerId) {
      return cors(Response.json(
        {
          success: false,
          error: "Kunden-ID konnte nicht ermittelt werden.",
        },
        { status: 401 }
      ));
    }

    const result = await saveMarketplaceProduct({
      request,
      customerId,
    });

    return cors(result);
  } catch (error) {
    console.error("PRODUCT SAVE ERROR:", error);

    return cors(Response.json(
      {
        success: false,
        error: "Produkt konnte nicht gespeichert werden.",
      },
      { status: 500 }
    ));
  }
};

/*
 * =========================================================
 * OPTIONS / GET
 * =========================================================
 *
 * Die Shopify Customer Account Extension lÃ¤uft auf einer
 * anderen Domain als unsere Render-API.
 *
 * Vor einem POST mit Authorization-Header sendet der
 * Browser deshalb zunÃ¤chst eine CORS-Preflight-Anfrage
 * mit der Methode OPTIONS.
 */

export const loader = async ({ request }) => {
  /*
   * =======================================================
   * CORS PREFLIGHT
   * =======================================================
   */

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,

      headers: {
        "Access-Control-Allow-Origin": "*",

        "Access-Control-Allow-Methods":
          "POST, OPTIONS",

        "Access-Control-Allow-Headers":
          "Authorization, Content-Type",
      },
    });
  }


  /*
   * =======================================================
   * GET NICHT ERLAUBT
   * =======================================================
   */

  return Response.json(
    {
      success: false,

      error:
        "Diese Schnittstelle erwartet eine POST-Anfrage.",
    },
    {
      status: 405,

      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
};

