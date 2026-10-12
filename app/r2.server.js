import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

function getR2Client() {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
    R2_ENDPOINT,
  } = process.env;

  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET_NAME ||
    !R2_ENDPOINT
  ) {
    throw new Error("Cloudflare R2 ist nicht vollständig konfiguriert.");
  }

  const endpoint = new URL(R2_ENDPOINT);

  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error("Ungültiger Cloudflare-R2-Endpunkt.");
  }

  return {
    client: new S3Client({
      region: "auto",
      endpoint: endpoint.origin,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    }),
    bucket: R2_BUCKET_NAME,
  };
}

export async function uploadVerificationDocument({
  customerId,
  buffer,
  contentType,
}) {
  if (!customerId || typeof customerId !== "string") {
    throw new Error("Ungültige Kunden-ID.");
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Ungültiger Dokumenteninhalt.");
  }

  const allowedTypes = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
  };

  const extension = allowedTypes[contentType];

  if (!extension) {
    throw new Error("Dateityp nicht erlaubt.");
  }

  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error("Die Datei darf maximal 10 MB groß sein.");
  }

  const { client, bucket } = getR2Client();

  const key = `verification/${randomUUID()}.${extension}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return key;
}

export async function getVerificationDocument(key) {
  const { client, bucket } = getR2Client();

  return client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

export async function deleteVerificationDocument(key) {
  const { client, bucket } = getR2Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}