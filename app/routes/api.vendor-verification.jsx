import db from "../db.server";
import { authenticate } from "../shopify.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  let cors = (response) => response;

  try {
    const authentication =
      await authenticate.public.customerAccount(request);

    cors = authentication.cors;

    const customerId =
      authentication.sessionToken?.sub ?? null;

    if (!customerId) {
      return cors(
        Response.json(
          {
            success: false,
            error: "Kunden-ID konnte nicht ermittelt werden.",
          },
          { status: 401 }
        )
      );
    }

    const profile = await db.vendorProfile.findUnique({
      where: { customerId },
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

    return cors(
      Response.json({
        success: true,
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
      })
    );
  } catch (error) {
    console.error(
      "VENDOR VERIFICATION LOAD ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,
          error:
            "Verifizierungsstatus konnte nicht geladen werden.",
        },
        { status: 500 }
      )
    );
  }
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  let cors = (response) => response;

  try {
    const authentication =
      await authenticate.public.customerAccount(request);

    cors = authentication.cors;

    const customerId =
      authentication.sessionToken?.sub ?? null;

    if (!customerId) {
      return cors(
        Response.json(
          {
            success: false,
            error: "Kunden-ID konnte nicht ermittelt werden.",
          },
          { status: 401 }
        )
      );
    }

    if (request.method !== "POST") {
      return cors(
        Response.json(
          {
            success: false,
            error: "Methode nicht unterstützt.",
          },
          { status: 405 }
        )
      );
    }

    const body = await request.json();

    if (body?.action === "submit") {
      const profile = await db.vendorProfile.findUnique({
        where: { customerId },
        select: {
          verificationStatus: true,
          verificationCompanyName: true,
          verificationShopUrl: true,
          verificationDocumentKey: true,
        },
      });

      if (!profile) {
        return cors(
          Response.json(
            {
              success: false,
              error:
                "Bitte speichern Sie zuerst Ihre Unternehmensdaten.",
            },
            { status: 400 }
          )
        );
      }

      if (
        !["not_submitted", "rejected"].includes(
          profile.verificationStatus
        )
      ) {
        return cors(
          Response.json(
            {
              success: false,
              error:
                "Dieser Verifizierungsantrag wurde bereits eingereicht oder abgeschlossen.",
            },
            { status: 409 }
          )
        );
      }

      if (
        !profile.verificationCompanyName?.trim() ||
        !profile.verificationShopUrl?.trim() ||
        !profile.verificationDocumentKey
      ) {
        return cors(
          Response.json(
            {
              success: false,
              error:
                "Bitte speichern Sie Unternehmensname und Shop-URL und laden Sie einen Unternehmensnachweis hoch.",
            },
            { status: 400 }
          )
        );
      }

      const submittedAt = new Date();

      const result = await db.vendorProfile.updateMany({
        where: {
          customerId,
          verificationStatus: {
            in: ["not_submitted", "rejected"],
          },
          verificationCompanyName:
            profile.verificationCompanyName,
          verificationShopUrl:
            profile.verificationShopUrl,
          verificationDocumentKey:
            profile.verificationDocumentKey,
        },
        data: {
          verificationStatus: "pending",
          verificationSubmittedAt: submittedAt,
          verificationReviewedAt: null,
          verificationReviewNote: null,
        },
      });

      if (result.count !== 1) {
        return cors(
          Response.json(
            {
              success: false,
              error:
                "Das Anbieterprofil wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu.",
            },
            { status: 409 }
          )
        );
      }

      return cors(
        Response.json({
          success: true,
          message:
            "Ihr Verifizierungsantrag wurde erfolgreich eingereicht.",
          verification: {
            status: "pending",
            submittedAt: submittedAt.toISOString(),
          },
        })
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof body.companyName !== "string" ||
      typeof body.shopUrl !== "string"
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error: "Ungültige Unternehmensdaten.",
          },
          { status: 400 }
        )
      );
    }

    const companyName = body.companyName.trim();
    const shopUrlInput = body.shopUrl.trim();

    if (
      companyName.length < 2 ||
      companyName.length > 200
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Der Unternehmensname muss zwischen 2 und 200 Zeichen enthalten.",
          },
          { status: 400 }
        )
      );
    }

    if (
      shopUrlInput.length > 2000 ||
      shopUrlInput.length === 0
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error: "Bitte geben Sie eine gültige Shop-URL ein.",
          },
          { status: 400 }
        )
      );
    }

    let shopUrl;

    try {
      const parsedUrl = new URL(shopUrlInput);

      if (
        parsedUrl.protocol !== "https:" ||
        !parsedUrl.hostname.includes(".") ||
        parsedUrl.username ||
        parsedUrl.password
      ) {
        throw new Error("Invalid shop URL");
      }

      shopUrl = parsedUrl.href;
    } catch {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Bitte geben Sie eine gültige HTTPS-Shop-URL ein.",
          },
          { status: 400 }
        )
      );
    }

    const result = await db.vendorProfile.updateMany({
      where: {
        customerId,
        verificationStatus: {
          in: ["not_submitted", "rejected"],
        },
      },
      data: {
        verificationCompanyName: companyName,
        verificationShopUrl: shopUrl,
      },
    });

    if (result.count === 0) {
      const existing = await db.vendorProfile.findUnique({
        where: { customerId },
        select: { verificationStatus: true },
      });

      if (!existing) {
        try {
          await db.vendorProfile.create({
            data: {
              customerId,
              verificationCompanyName: companyName,
              verificationShopUrl: shopUrl,
            },
          });
        } catch (error) {
          if (error?.code === "P2002") {
            return cors(
              Response.json(
                {
                  success: false,
                  error:
                    "Das Anbieterprofil wurde zwischenzeitlich geändert. Bitte erneut versuchen.",
                },
                { status: 409 }
              )
            );
          }

          throw error;
        }
      } else {
        return cors(
          Response.json(
            {
              success: false,
              error:
                "Die Unternehmensdaten können während der Prüfung oder nach erfolgreicher Verifizierung nicht geändert werden.",
            },
            { status: 409 }
          )
        );
      }
    }

    return cors(
      Response.json({
        success: true,
        message:
          "Unternehmensdaten wurden erfolgreich gespeichert.",
        verification: {
          companyName,
          shopUrl,
        },
      })
    );
  } catch (error) {
    console.error(
      "VENDOR VERIFICATION SAVE ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,
          error:
            "Unternehmensdaten konnten nicht gespeichert werden.",
        },
        { status: 500 }
      )
    );
  }
};