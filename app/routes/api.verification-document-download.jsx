import { createHash } from "node:crypto";
import db from "../db.server";
import { getVerificationDocument } from "../r2.server";

const ALLOWED_SHOP = "0yr6cb-b4.myshopify.com";

const errorResponse = (message, status) =>
  Response.json(
    { success: false, error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return errorResponse(
      "Ungültige Downloadberechtigung.",
      400
    );
  }

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  try {
    const now = new Date();

    const claimed = await db.verificationDownloadToken.updateMany({
      where: {
        tokenHash,
        shop: ALLOWED_SHOP,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        usedAt: now,
      },
    });

    if (claimed.count !== 1) {
      return errorResponse(
        "Downloadberechtigung abgelaufen oder bereits verwendet.",
        403
      );
    }

    const authorization =
      await db.verificationDownloadToken.findUnique({
        where: { tokenHash },
        select: { customerId: true },
      });

    if (!authorization) {
      return errorResponse(
        "Downloadberechtigung nicht gefunden.",
        403
      );
    }

    const profile = await db.vendorProfile.findUnique({
      where: {
        customerId: authorization.customerId,
      },
      select: {
        verificationDocumentKey: true,
      },
    });

    if (!profile?.verificationDocumentKey) {
      return errorResponse(
        "Kein Gewerbenachweis vorhanden.",
        404
      );
    }

    const document = await getVerificationDocument(
      profile.verificationDocumentKey
    );

    const allowedTypes = {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
    };

    const contentType = document.ContentType;
    const extension = allowedTypes[contentType];

    if (!extension || !document.Body) {
      return errorResponse(
        "Dokumentenformat nicht unterstützt.",
        415
      );
    }

    return new Response(
      document.Body.transformToWebStream(),
      {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition":
            `attachment; filename="gewerbenachweis.${extension}"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
        },
      }
    );
  } catch (error) {
    console.error(
      "VERIFICATION DOCUMENT DOWNLOAD ERROR:",
      error
    );

    return errorResponse(
      "Dokument konnte nicht heruntergeladen werden.",
      500
    );
  }
};