import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  try {
    const { sessionToken, cors } =
      await authenticate.public.customerAccount(request);

    console.log("SESSION TOKEN SUB:", sessionToken?.sub);
    console.log("SESSION TOKEN DEST:", sessionToken?.dest);

    return cors(
      Response.json({
        success: true,
        test: true,
        customerId: sessionToken?.sub ?? null,
        shop: sessionToken?.dest ?? null,
      })
    );
  } catch (error) {
    console.error("CUSTOMER ACCOUNT AUTH ERROR:", error);

    return Response.json(
      {
        success: false,
        error: String(error),
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