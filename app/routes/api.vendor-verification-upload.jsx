import db from "../db.server";
import { authenticate } from "../shopify.server";
import {
  uploadVerificationDocument,
  deleteVerificationDocument,
} from "../r2.server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_REQUEST_SIZE = 11 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function detectContentType(buffer) {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  ) {
    return "application/pdf";
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) {
    return "image/png";
  }

  return null;
}

async function readLimitedRequest(request) {
  if (!request.body) {
    throw new Error("EMPTY_REQUEST");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalSize += value.byteLength;

      if (totalSize > MAX_REQUEST_SIZE) {
        throw new Error("REQUEST_TOO_LARGE");
      }

      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalSize);
}

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  return Response.json(
    { error: "Methode nicht unterstützt." },
    {
      status: 405,
      headers: corsHeaders,
    }
  );
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
            error: "Kunde nicht angemeldet.",
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

    const contentLengthHeader =
      request.headers.get("content-length");

    if (contentLengthHeader !== null) {
      const contentLength = Number(contentLengthHeader);

      if (
        !Number.isFinite(contentLength) ||
        contentLength < 0 ||
        contentLength > MAX_REQUEST_SIZE
      ) {
        return cors(
          Response.json(
            {
              success: false,
              error: "Die Upload-Anfrage ist zu groß.",
            },
            { status: 413 }
          )
        );
      }
    }

    const profile = await db.vendorProfile.findUnique({
      where: { customerId },
      select: {
        verificationStatus: true,
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
              "Während der Prüfung oder nach erfolgreicher Verifizierung können keine Dokumente ausgetauscht werden.",
          },
          { status: 409 }
        )
      );
    }

    let requestBuffer;

    try {
      requestBuffer = await readLimitedRequest(request);
    } catch (error) {
      if (error.message === "REQUEST_TOO_LARGE") {
        return cors(
          Response.json(
            {
              success: false,
              error:
                "Die Upload-Anfrage darf maximal 11 MB groß sein.",
            },
            { status: 413 }
          )
        );
      }

      if (error.message === "EMPTY_REQUEST") {
        return cors(
          Response.json(
            {
              success: false,
              error: "Keine Datei übermittelt.",
            },
            { status: 400 }
          )
        );
      }

      throw error;
    }

    const contentTypeHeader =
      request.headers.get("content-type") || "";

    if (
      !contentTypeHeader
        .toLowerCase()
        .startsWith("multipart/form-data;")
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error: "Ungültiges Upload-Format.",
          },
          { status: 400 }
        )
      );
    }

    const limitedRequest = new Request(request.url, {
      method: "POST",
      headers: {
        "Content-Type": contentTypeHeader,
      },
      body: requestBuffer,
    });

let formData;

try {
  formData = await limitedRequest.formData();
} catch {
  return cors(
    Response.json(
      {
        success: false,
        error: "Die hochgeladene Datei konnte nicht verarbeitet werden.",
      },
      { status: 400 }
    )
  );
}

const file = formData.get("document");

    if (
      !file ||
      typeof file.arrayBuffer !== "function"
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error: "Bitte wählen Sie ein Dokument aus.",
          },
          { status: 400 }
        )
      );
    }

    if (
      file.size === 0 ||
      file.size > MAX_FILE_SIZE
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Die Datei muss zwischen 1 Byte und 10 MB groß sein.",
          },
          { status: 400 }
        )
      );
    }

    const buffer = Buffer.from(
      await file.arrayBuffer()
    );

    const contentType = detectContentType(buffer);

    if (
      !contentType ||
      file.type !== contentType
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Nur gültige PDF-, JPG- und PNG-Dateien sind erlaubt.",
          },
          { status: 400 }
        )
      );
    }

    const newDocumentKey =
      await uploadVerificationDocument({
        customerId,
        buffer,
        contentType,
      });

    let updated;

    try {
      updated = await db.vendorProfile.updateMany({
        where: {
          customerId,
          verificationStatus: {
            in: ["not_submitted", "rejected"],
          },
          verificationDocumentKey:
            profile.verificationDocumentKey,
        },
        data: {
          verificationDocumentKey: newDocumentKey,
        },
      });
    } catch (error) {
      await deleteVerificationDocument(
        newDocumentKey
      ).catch((cleanupError) => {
        console.error(
          "R2 UPLOAD CLEANUP ERROR:",
          cleanupError
        );
      });

      throw error;
    }

    if (updated.count !== 1) {
      await deleteVerificationDocument(
        newDocumentKey
      ).catch((cleanupError) => {
        console.error(
          "R2 UPLOAD CLEANUP ERROR:",
          cleanupError
        );
      });

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

    if (profile.verificationDocumentKey) {
      await deleteVerificationDocument(
        profile.verificationDocumentKey
      ).catch((cleanupError) => {
        console.error(
          "R2 OLD DOCUMENT CLEANUP ERROR:",
          cleanupError
        );
      });
    }

    return cors(
      Response.json({
        success: true,
        message:
          "Ihr Unternehmensnachweis wurde sicher hochgeladen.",
        documentUploaded: true,
      })
    );
  } catch (error) {
    console.error(
      "VENDOR VERIFICATION UPLOAD ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,
          error:
            "Der Dokumenten-Upload ist fehlgeschlagen.",
        },
        { status: 500 }
      )
    );
  }
};