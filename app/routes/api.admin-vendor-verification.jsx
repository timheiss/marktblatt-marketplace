import db from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  let addCors = (response) => response;

  try {
const { session, cors, sessionToken } =
  await authenticate.admin(request);
addCors = cors;

if (!sessionToken?.sub) {
  return cors(
    Response.json(
      {
        success: false,
        error: "Keine gültige Shopify-Admin-Benutzerkennung.",
      },
      { status: 401 }
    )
  );
}

const ALLOWED_SHOP = "0yr6cb-b4.myshopify.com";

if (!session?.shop) {
  return cors(
    Response.json(
      {
        success: false,
        error: "Keine gültige Shopify-Admin-Sitzung.",
      },
      { status: 401 }
    )
  );
}

if (session.shop !== ALLOWED_SHOP) {
  return cors(
    Response.json(
      {
        success: false,
        error: "Zugriff auf diesen Shopify-Shop nicht erlaubt.",
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
      error: "Ungültige Shopify-Kunden-ID.",
    },
    { status: 400 }
  )
);
    }

    const profile = await db.vendorProfile.findUnique({
      where: {
        customerId,
      },
      select: {
        verificationStatus: true,
        verificationCompanyName: true,
        verificationShopUrl: true,
        verificationDocumentKey: true,
        verificationSubmittedAt: true,
        verificationReviewedAt: true,
        verificationReviewNote: true,
      },
    });

return cors(Response.json({
  success: true,
  customerId,
  verification: {
        status:
          profile?.verificationStatus ?? "not_submitted",
        companyName:
          profile?.verificationCompanyName ?? "",
        shopUrl:
          profile?.verificationShopUrl ?? "",
        documentUploaded:
          Boolean(profile?.verificationDocumentKey),
        submittedAt:
          profile?.verificationSubmittedAt ?? null,
        reviewedAt:
          profile?.verificationReviewedAt ?? null,
        reviewNote:
          profile?.verificationReviewNote ?? "",
      },
    }));
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    console.error(
      "ADMIN VENDOR VERIFICATION ERROR:",
      error
    );

return addCors(
  Response.json(
    {
      success: false,
      error: "Verifizierungsdaten konnten nicht geladen werden.",
    },
    { status: 500 }
  )
);
  }
};
export const action = async ({ request }) => {
  const { session, sessionToken, cors } =
    await authenticate.admin(request);

  const respond = (data, status = 200) =>
    cors(
      Response.json(data, {
        status,
        headers: { "Cache-Control": "no-store" },
      })
    );

  if (request.method !== "POST") {
    return respond(
      { success: false, error: "Methode nicht erlaubt." },
      405
    );
  }

  if (
    session?.shop !== "0yr6cb-b4.myshopify.com" ||
    !sessionToken?.sub
  ) {
    return respond(
      { success: false, error: "Keine Admin-Berechtigung." },
      403
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return respond(
      { success: false, error: "Ungültige Anfrage." },
      400
    );
  }

  const { customerId, decision, reviewNote } = body ?? {};

  if (
    typeof customerId !== "string" ||
    !/^gid:\/\/shopify\/Customer\/\d+$/.test(customerId)
  ) {
    return respond(
      { success: false, error: "Ungültige Kunden-ID." },
      400
    );
  }

  if (!["verified", "rejected"].includes(decision)) {
    return respond(
      { success: false, error: "Ungültige Entscheidung." },
      400
    );
  }

  if (
    reviewNote !== undefined &&
    typeof reviewNote !== "string"
  ) {
    return respond(
      { success: false, error: "Ungültige Begründung." },
      400
    );
  }

  const note = (reviewNote ?? "").trim();

  if (note.length > 2000) {
    return respond(
      {
        success: false,
        error: "Die Begründung darf maximal 2000 Zeichen enthalten.",
      },
      400
    );
  }

  if (decision === "rejected" && !note) {
    return respond(
      {
        success: false,
        error: "Bitte eine Begründung für die Ablehnung eingeben.",
      },
      400
    );
  }

  try {
    const result = await db.vendorProfile.updateMany({
      where: {
        customerId,
        verificationStatus: "pending",
        verificationDocumentKey: { not: null },
        verificationCompanyName: { not: null },
        verificationShopUrl: { not: null },
      },
      data: {
        verificationStatus: decision,
        verificationReviewedAt: new Date(),
        verificationReviewNote: note || null,
      },
    });

    if (result.count !== 1) {
      return respond(
        {
          success: false,
          error:
            "Der Antrag ist nicht mehr zur Prüfung verfügbar. Bitte die Kundendaten aktualisieren.",
        },
        409
      );
    }

    return respond({
      success: true,
      status: decision,
      reviewNote: note,
    });
  } catch (error) {
    console.error(
      "ADMIN VENDOR VERIFICATION DECISION ERROR:",
      error
    );

    return respond(
      {
        success: false,
        error: "Die Entscheidung konnte nicht gespeichert werden.",
      },
      500
    );
  }
};