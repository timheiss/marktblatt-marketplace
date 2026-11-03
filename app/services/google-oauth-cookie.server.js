
import crypto from "node:crypto";

export const GOOGLE_OAUTH_COOKIE = "__Host-marktblatt-google-oauth";

export function createGoogleOAuthCookie(nonce) {
  const nonceHash = crypto
    .createHash("sha256")
    .update(nonce)
    .digest("hex");

  return [
    `${GOOGLE_OAUTH_COOKIE}=${nonceHash}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=600",
  ].join("; ");
}


export function verifyGoogleOAuthCookie(request, nonce) {
  if (typeof nonce !== "string" || !nonce) {
    return false;
  }

  const cookieHeader = request.headers.get("Cookie") || "";

  const cookieValue = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) =>
      part.startsWith(`${GOOGLE_OAUTH_COOKIE}=`)
    )
    ?.slice(GOOGLE_OAUTH_COOKIE.length + 1);

  if (!cookieValue || !/^[a-f0-9]{64}$/.test(cookieValue)) {
    return false;
  }

  const expectedHash = crypto
    .createHash("sha256")
    .update(nonce)
    .digest();

  const receivedHash = Buffer.from(cookieValue, "hex");

  return crypto.timingSafeEqual(
    receivedHash,
    expectedHash
  );
}


export function clearGoogleOAuthCookie() {
  return [
    `${GOOGLE_OAUTH_COOKIE}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ].join("; ");
}

