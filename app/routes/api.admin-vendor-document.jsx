import db from "../db.server";
import { authenticate } from "../shopify.server";
import { getVerificationDocument } from "../r2.server";

const ALLOWED_SHOP = "0yr6cb-b4.myshopify.com";

export const loader = async ({ request }) => {
  const { session, sessionToken, cors } =
    await authenticate.admin(request);

  if (
    session?.shop !== ALLOWED_SHOP ||
    !sessionToken?.sub
  ) {
    return cors(
      Response.json(
        {
          success: false,
          error: "Keine Berechtigung zum Dokumentenabruf.",
        },
        { status: 403 }
      )
    );
  }

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");

  if (
    !customerId ||
    !/^gid:\/\/shopify\/Customer\/\d+$/.test(customerId)
  ) {
    return cors(
      Response.json(
        {
          success: false,
          error: "Ungültige Kunden-ID.",
        },
        { status: 400 }
      )
    );
  }

  const profile = await db.vendorProfile.findUnique({
    where: { customerId },
    select: { verificationDocumentKey: true },
  });

  if (!profile?.verificationDocumentKey) {
    return cors(
      Response.json(
        {
          success: false,
          error: "Kein Unternehmensnachweis vorhanden.",
        },
        { status: 404 }
      )
    );
  }

  try {
    const document = await getVerificationDocument(
      profile.verificationDocumentKey
    );

    const contentType = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ].includes(document.ContentType)
      ? document.ContentType
      : "application/octet-stream";

    return cors(
      new Response(document.Body.transformToWebStream(), {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": "attachment; filename=\"unternehmensnachweis\"",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      })
    );
  } catch (error) {
    console.error(
      "ADMIN VERIFICATION DOCUMENT ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,
          error: "Dokument konnte nicht geladen werden.",
        },
        { status: 500 }
      )
    );
  }
};