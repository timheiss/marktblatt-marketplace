import db from "../db.server";
import {
  authenticate,
  unauthenticated,
} from "../shopify.server";


/*
 * =========================================================
 * CORS
 * =========================================================
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
};


/*
 * =========================================================
 * ERLAUBTE BILDTYPEN
 * =========================================================
 */

const allowedImageTypes =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

/*
 * =========================================================
 * CORS PREFLIGHT
 * =========================================================
 */

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  return Response.json(
    {
      success: false,
      error: "Methode nicht unterstützt.",
    },
    {
      status: 405,
      headers: corsHeaders,
    }
  );
};

/*
 * =========================================================
 * UPLOAD
 * =========================================================
 */

export const action = async ({ request }) => {

  /*
   * CORS PREFLIGHT
   */

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  let cors = (response) => response;

  try {

    /*
     * =====================================================
     * 1. KUNDEN AUTHENTIFIZIEREN
     * =====================================================
     */

    const authentication =
      await authenticate.public.customerAccount(
        request
      );

    cors = authentication.cors;

    const customerId =
      authentication.sessionToken?.sub ??
      null;

    if (!customerId) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Kunden-ID konnte nicht ermittelt werden.",
          },
          {
            status: 401,
          }
        )
      );
    }

    if (request.method !== "POST") {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Methode nicht unterstützt.",
          },
          {
            status: 405,
          }
        )
      );
    }


    /*
     * =====================================================
     * 2. FORM-DATEN / DATEI LESEN
     * =====================================================
     */

    const formData =
      await request.formData();

    const image =
      formData.get("image");

    if (
      !image ||
      typeof image === "string"
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Bitte wählen Sie ein Bild aus.",
          },
          {
            status: 400,
          }
        )
      );
    }


    /*
     * =====================================================
     * 3. DATEI PRÜFEN
     * =====================================================
     */

    const mimeType =
      String(image.type || "")
        .toLowerCase();

    if (
      !allowedImageTypes.has(mimeType)
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Erlaubt sind JPG-, PNG- und WebP-Bilder.",
          },
          {
            status: 400,
          }
        )
      );
    }

    /*
     * Maximal 10 MB.
     */

    const maxFileSize =
      10 * 1024 * 1024;

    if (
      !image.size ||
      image.size > maxFileSize
    ) {
      return cors(
        Response.json(
          {
            success: false,
            error:
              "Das Bild darf maximal 10 MB groß sein.",
          },
          {
            status: 400,
          }
        )
      );
    }

    const filename =
      String(
        image.name ||
        `anbieter-${customerId}.jpg`
      )
        .replace(
          /[^a-zA-Z0-9._-]/g,
          "-"
        )
        .slice(0, 150);


    /*
     * =====================================================
     * 4. MARKTBLATT-SHOP / ADMIN API
     * =====================================================
     */

    const marktblattShop =
      process.env.MARKTBLATT_SHOP;

    if (!marktblattShop) {
      throw new Error(
        "MARKTBLATT_SHOP ist auf dem Server nicht konfiguriert."
      );
    }

    if (
      !marktblattShop.endsWith(
        ".myshopify.com"
      )
    ) {
      throw new Error(
        "MARKTBLATT_SHOP enthält keine gültige Shopify-Shop-Domain."
      );
    }

    const { admin } =
      await unauthenticated.admin(
        marktblattShop
      );


    /*
     * =====================================================
     * 5. STAGED UPLOAD ERZEUGEN
     * =====================================================
     */

    const stagedResponse =
      await admin.graphql(
        `#graphql
          mutation VendorImageStagedUpload(
            $input: [StagedUploadInput!]!
          ) {
            stagedUploadsCreate(
              input: $input
            ) {
              stagedTargets {
                url
                resourceUrl

                parameters {
                  name
                  value
                }
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
            input: [
              {
                filename,
                mimeType,
                httpMethod: "POST",
                resource:
                  "PRODUCT_IMAGE",
              },
            ],
          },
        }
      );

    const stagedResult =
      await stagedResponse.json();

    if (
      stagedResult?.errors?.length
    ) {
      console.error(
        "VENDOR IMAGE STAGED GRAPHQL ERRORS:",
        stagedResult.errors
      );

      throw new Error(
        "Shopify konnte den Bild-Upload nicht vorbereiten."
      );
    }

    const stagedData =
      stagedResult?.data
        ?.stagedUploadsCreate;

    if (
      stagedData?.userErrors?.length
    ) {
      console.error(
        "VENDOR IMAGE STAGED USER ERRORS:",
        stagedData.userErrors
      );

      throw new Error(
        stagedData.userErrors[0]
          ?.message ||
        "Shopify konnte den Bild-Upload nicht vorbereiten."
      );
    }

    const target =
      stagedData
        ?.stagedTargets?.[0];

    if (
      !target?.url ||
      !target?.resourceUrl
    ) {
      throw new Error(
        "Shopify hat kein Upload-Ziel zurückgegeben."
      );
    }


    /*
     * =====================================================
     * 6. DATEI ZU SHOPIFY HOCHLADEN
     * =====================================================
     */

    const uploadForm =
      new FormData();

    for (
      const parameter of
      target.parameters || []
    ) {
      uploadForm.append(
        parameter.name,
        parameter.value
      );
    }

    uploadForm.append(
      "file",
      image,
      filename
    );

    const uploadResponse =
      await fetch(
        target.url,
        {
          method: "POST",
          body: uploadForm,
        }
      );

    if (!uploadResponse.ok) {
      const uploadError =
        await uploadResponse.text();

      console.error(
        "VENDOR IMAGE STAGED UPLOAD ERROR:",
        uploadResponse.status,
        uploadError
      );

      throw new Error(
        "Das Bild konnte nicht zu Shopify hochgeladen werden."
      );
    }


    /*
     * =====================================================
     * 7. SHOPIFY FILE ERZEUGEN
     * =====================================================
     */

    const fileResponse =
      await admin.graphql(
        `#graphql
          mutation CreateVendorImage(
            $files: [FileCreateInput!]!
          ) {
            fileCreate(
              files: $files
            ) {
              files {
                id
                fileStatus
                alt

                ... on MediaImage {
                  image {
                    url
                    width
                    height
                  }
                }
              }

              userErrors {
                field
                message
                code
              }
            }
          }
        `,
        {
          variables: {
            files: [
              {
                originalSource:
                  target.resourceUrl,

                contentType:
                  "IMAGE",

                alt:
                  "Hintergrundbild Über den Anbieter",
              },
            ],
          },
        }
      );

    const fileResult =
      await fileResponse.json();

    if (
      fileResult?.errors?.length
    ) {
      console.error(
        "VENDOR IMAGE FILE CREATE GRAPHQL ERRORS:",
        fileResult.errors
      );

      throw new Error(
        "Shopify konnte die Bilddatei nicht erstellen."
      );
    }

    const fileData =
      fileResult?.data
        ?.fileCreate;

    if (
      fileData?.userErrors?.length
    ) {
      console.error(
        "VENDOR IMAGE FILE CREATE USER ERRORS:",
        fileData.userErrors
      );

      throw new Error(
        fileData.userErrors[0]
          ?.message ||
        "Shopify konnte die Bilddatei nicht erstellen."
      );
    }

    const shopifyFile =
      fileData?.files?.[0];

    if (!shopifyFile?.id) {
      throw new Error(
        "Shopify hat keine Datei-ID zurückgegeben."
      );
    }


    /*
     * =====================================================
     * 8. FILE-GID IM ANBIETERPROFIL SPEICHERN
     * =====================================================
     */

    await db.vendorProfile.upsert({
      where: {
        customerId,
      },

      create: {
        customerId,
        backgroundImageId:
          shopifyFile.id,
      },

      update: {
        backgroundImageId:
          shopifyFile.id,
      },
    });


    /*
     * =====================================================
     * 9. ERFOLG
     * =====================================================
     */

    return cors(
      Response.json({
        success: true,

        backgroundImageId:
          shopifyFile.id,

        fileStatus:
          shopifyFile.fileStatus ??
          null,

        imageUrl:
          shopifyFile.image?.url ??
          null,
      })
    );

  } catch (error) {
    console.error(
      "VENDOR BACKGROUND IMAGE ERROR:",
      error
    );

    return cors(
      Response.json(
        {
          success: false,

          error:
            error instanceof Error
              ? error.message
              : "Das Hintergrundbild konnte nicht hochgeladen werden.",
        },
        {
          status: 500,
        }
      )
    );
  }
};