import { randomBytes, createHash } from "node:crypto";
import db from "../db.server";
import { authenticate } from "../shopify.server";

const ALLOWED_SHOP = "0yr6cb-b4.myshopify.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  return Response.json(
    { success: false, error: "Methode nicht erlaubt." },
    {
      status: 405,
      headers: corsHeaders,
    }
  );
};

export const action = async ({ request }) => {
  const { session, sessionToken, cors } =
    await authenticate.admin(request);

  if (request.method !== "POST") {
    return cors(
      Response.json(
        { success: false, error: "Methode nicht erlaubt." },
        { status: 405 }
      )
    );
  }

  if (
    session?.shop !== ALLOWED_SHOP ||
    !sessionToken?.sub
  ) {
    return cors(
      Response.json(
        { success: false, error: "Keine Admin-Berechtigung." },
        { status: 403 }
      )
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return cors(
      Response.json(
        { success: false, error: "Ungültige Anfrage." },
        { status: 400 }
      )
    );
  }

  const customerId = body?.customerId;

  if (
    typeof customerId !== "string" ||
    !/^gid:\/\/shopify\/Customer\/\d+$/.test(customerId)
  ) {
    return cors(
      Response.json(
        { success: false, error: "Ungültige Kunden-ID." },
        { status: 400 }
      )
    );
  }

  try {
    const profile = await db.vendorProfile.findUnique({
      where: { customerId },
      select: { verificationDocumentKey: true },
    });

    if (!profile?.verificationDocumentKey) {
      return cors(
        Response.json(
          {
            success: false,
            error: "Kein Gewerbenachweis vorhanden.",
          },
          { status: 404 }
        )
      );
    }

    const token = randomBytes(32).toString("hex");

    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    await db.verificationDownloadToken.create({
      data: {
        tokenHash,
        customerId,
        shop: ALLOWED_SHOP,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    return cors(
      Response.json(
        {
          success: true,
          token,
          expiresIn: 60,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      )
    );
  } catch (error) {
    console.error(
      "ADMIN DOCUMENT TOKEN ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,
          error: "Downloadberechtigung konnte nicht erstellt werden.",
        },
        { status: 500 }
      )
    );
  }
};