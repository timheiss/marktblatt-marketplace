import db from "../db.server";
import sharp from "sharp";
import { authenticate, unauthenticated } from "../shopify.server";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxCompanyLogoSize = 2 * 1024 * 1024;
const maxBrandLogoSize = 1 * 1024 * 1024;
const maxBrandLogos = 15;
const logoKinds = new Set(["company_wide", "company_square", "brand"]);
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body, status = 200, cors = (response) => response) =>
  cors(Response.json(body, { status }));

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return Response.json({ success: false, error: "Methode nicht unterstützt." }, {
    status: 405,
    headers: corsHeaders,
  });
};

async function getAdmin() {
  const shop = process.env.MARKTBLATT_SHOP;
  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
    throw new Error("MARKTBLATT_SHOP ist nicht korrekt konfiguriert.");
  }
  const { admin } = await unauthenticated.admin(shop);
  return admin;
}

async function graphql(admin, query, variables, operation) {
  const response = await admin.graphql(query, { variables });
  const result = await response.json();
  if (result.errors?.length) {
    console.error(`${operation} GraphQL:`, result.errors);
    throw new Error("Shopify konnte die Anfrage nicht verarbeiten.");
  }
  return result.data;
}

async function uploadToShopify(admin, image, kind, customerId, mimeType) {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const filename = `marktblatt-${kind}-${customerId.replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const staged = await graphql(admin, `#graphql
    mutation VendorLogoStagedUpload($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }
  `, { input: [{ filename, mimeType, httpMethod: "POST", resource: "PRODUCT_IMAGE" }] }, "stagedUploadsCreate");

  const stage = staged?.stagedUploadsCreate;
  if (stage?.userErrors?.length) throw new Error(stage.userErrors[0].message);
  const target = stage?.stagedTargets?.[0];
  if (!target?.url || !target?.resourceUrl) throw new Error("Shopify hat kein Upload-Ziel zurückgegeben.");

  const form = new FormData();
  for (const parameter of target.parameters || []) form.append(parameter.name, parameter.value);
  form.append("file", image, filename);
  const uploaded = await fetch(target.url, { method: "POST", body: form });
  if (!uploaded.ok) throw new Error("Das Logo konnte nicht zu Shopify hochgeladen werden.");

  const created = await graphql(admin, `#graphql
    mutation VendorLogoFileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus ... on MediaImage { image { url } } }
        userErrors { message }
      }
    }
  `, { files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", alt: kind === "brand" ? "Markenlogo" : "Firmenlogo" }] }, "fileCreate");

  const fileData = created?.fileCreate;
  if (fileData?.userErrors?.length) throw new Error(fileData.userErrors[0].message);
  const file = fileData?.files?.[0];
  if (!file?.id) throw new Error("Shopify hat keine Datei-ID zurückgegeben.");
  return file;
}

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  let cors = (response) => response;
  try {
    const authentication = await authenticate.public.customerAccount(request);
    cors = authentication.cors;
    const customerId = authentication.sessionToken?.sub;
    if (!customerId) return json({ success: false, error: "Kunden-ID konnte nicht ermittelt werden." }, 401, cors);
    if (request.method !== "POST") return json({ success: false, error: "Methode nicht unterstützt." }, 405, cors);

    const form = await request.formData();
    const operation = String(form.get("operation") || "upload");
    const kind = String(form.get("kind") || "");
    if (!logoKinds.has(kind)) return json({ success: false, error: "Ungültige Logoart." }, 400, cors);

    if (operation === "delete") {
      const logoId = String(form.get("logoId") || "");
      if (kind === "brand") {
        if (!logoId) return json({ success: false, error: "Logo-ID fehlt." }, 400, cors);
        const changed = await db.$queryRaw`
          UPDATE "VendorProfile"
          SET "brandLogoIds" = array_remove("brandLogoIds", ${logoId}), "updatedAt" = NOW()
          WHERE "customerId" = ${customerId} AND ${logoId} = ANY("brandLogoIds")
          RETURNING "brandLogoIds"
        `;
        if (!changed.length) return json({ success: false, error: "Markenlogo nicht gefunden." }, 404, cors);
        return json({ success: true, brandLogoIds: changed[0].brandLogoIds }, 200, cors);
      }
      const field = kind === "company_wide" ? "companyLogoWideId" : "companyLogoSquareId";
      const current = await db.vendorProfile.findUnique({ where: { customerId } });
      if (!current?.[field]) return json({ success: false, error: "Firmenlogo nicht gefunden." }, 404, cors);
      await db.vendorProfile.update({ where: { customerId }, data: { [field]: null } });
      return json({ success: true, [field]: null }, 200, cors);
    }

    if (operation !== "upload") return json({ success: false, error: "Ungültige Aktion." }, 400, cors);
    const image = form.get("image");
    if (!image || typeof image === "string") return json({ success: false, error: "Bitte wählen Sie ein Logo aus." }, 400, cors);
    const mimeType = String(image.type || "").toLowerCase();
    if (!allowedImageTypes.has(mimeType)) return json({ success: false, error: "Erlaubt sind JPG, PNG und WebP." }, 400, cors);
 const maxFileSize =
  kind === "brand" ? maxBrandLogoSize : maxCompanyLogoSize;

if (!image.size || image.size > maxFileSize) {
  return json({
    success: false,
    error: kind === "brand"
      ? "Ein Markenlogo darf maximal 1 MB groß sein."
      : "Ein Firmenlogo darf maximal 2 MB groß sein."
  }, 400, cors);
}

    let metadata;
    try {
      metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    } catch {
      return json({ success: false, error: "Ungültige oder beschädigte Bilddatei." }, 400, cors);
    }
    if (!metadata.width || !metadata.height) return json({ success: false, error: "Bildabmessungen fehlen." }, 400, cors);
    const ratio = metadata.width / metadata.height;
if (kind === "company_wide" && Math.abs(ratio - 2) > 0.02) {
  return json({
    success: false,
    error: "Das Firmenlogo im Querformat muss 2:1 haben (±1 %)."
  }, 400, cors);
}
    if (kind === "company_square" && Math.abs(ratio - 1) > 0.01) {
      return json({ success: false, error: "Das quadratische Firmenlogo muss 1:1 haben (±1 %)." }, 400, cors);
    }

    // Fast-path: avoids unnecessary uploads when the brand limit is already reached.
    if (kind === "brand") {
      const existing = await db.vendorProfile.findUnique({ where: { customerId }, select: { brandLogoIds: true } });
      if ((existing?.brandLogoIds?.length || 0) >= maxBrandLogos) {
        return json({ success: false, error: "Maximal 15 Markenlogos sind erlaubt." }, 409, cors);
      }
    }

    const admin = await getAdmin();
    const file = await uploadToShopify(admin, image, kind, customerId, mimeType);

    if (kind === "brand") {
// Ensure a row exists, then append atomically. Concurrent requests cannot exceed 15.
      await db.vendorProfile.upsert({ where: { customerId }, create: { customerId }, update: {} });
      const updated = await db.$queryRaw`
        UPDATE "VendorProfile"
        SET "brandLogoIds" = array_append("brandLogoIds", ${file.id}), "updatedAt" = NOW()
        WHERE "customerId" = ${customerId}
          AND cardinality("brandLogoIds") < ${maxBrandLogos}
        RETURNING "brandLogoIds"
      `;
      if (!updated.length) {
        // Shopify file remains unassigned; do not delete shared files automatically.
        return json({ success: false, error: "Maximal 15 Markenlogos sind erlaubt. Das hochgeladene Bild wurde nicht zugeordnet." }, 409, cors);
      }
      return json({ success: true, logoId: file.id, brandLogoIds: updated[0].brandLogoIds, fileStatus: file.fileStatus, imageUrl: file.image?.url || null }, 200, cors);
    }

    const field = kind === "company_wide" ? "companyLogoWideId" : "companyLogoSquareId";
    await db.vendorProfile.upsert({ where: { customerId }, create: { customerId, [field]: file.id }, update: { [field]: file.id } });
    return json({ success: true, logoId: file.id, [field]: file.id, fileStatus: file.fileStatus, imageUrl: file.image?.url || null }, 200, cors);
  } catch (error) {
    console.error("VENDOR LOGO ERROR:", error);
    return json({ success: false, error: "Das Logo konnte nicht verarbeitet werden." }, 500, cors);
  }
};
