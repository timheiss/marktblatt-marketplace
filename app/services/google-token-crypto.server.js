
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const encodedKey =
    process.env.GOOGLE_ADS_TOKEN_ENCRYPTION_KEY;

  if (!encodedKey) {
    throw new Error(
      "Google Ads: Verschlüsselungsschlüssel fehlt."
    );
  }

  const key = Buffer.from(encodedKey, "base64");

  if (
    key.length !== 32 ||
    key.toString("base64") !== encodedKey
  ) {
    throw new Error(
      "Google Ads: Ungültiger Verschlüsselungsschlüssel."
    );
  }

  return key;
}

export function encryptGoogleToken(token) {
  if (typeof token !== "string" || !token) {
    throw new Error(
      "Google Ads: Ungültiges Token."
    );
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    ALGORITHM,
    key,
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptGoogleToken(value) {
  if (typeof value !== "string") {
    throw new Error(
      "Google Ads: Verschlüsseltes Token ungültig."
    );
  }

  const parts = value.split(".");

  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error(
      "Google Ads: Unbekanntes Tokenformat."
    );
  }

  const [, ivEncoded, tagEncoded, dataEncoded] = parts;

  const iv = Buffer.from(ivEncoded, "base64url");
  const authTag = Buffer.from(
    tagEncoded,
    "base64url"
  );
  const encrypted = Buffer.from(
    dataEncoded,
    "base64url"
  );

  if (
    iv.length !== 12 ||
    authTag.length !== 16 ||
    encrypted.length === 0
  ) {
    throw new Error(
      "Google Ads: Verschlüsselte Daten ungültig."
    );
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    iv
  );

  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}
