
import crypto from "node:crypto";

export function createGoogleOAuthState(userId) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;

  if (!secret) {
    throw new Error("GOOGLE_OAUTH_STATE_SECRET fehlt.");
  }

  const payload = {
    userId: String(userId),
    nonce: crypto.randomBytes(16).toString("hex"),
    expiresAt: Date.now() + 10 * 60 * 1000,
  };

  const data = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");

  return `${data}.${signature}`;
}


export function verifyGoogleOAuthState(state) {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;

  if (!secret || typeof state !== "string") {
    return null;
  }

  const parts = state.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [data, signature] = parts;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest();

  let receivedSignature;

  try {
    receivedSignature = Buffer.from(
      signature,
      "base64url"
    );
  } catch {
    return null;
  }

  if (
    receivedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(
      receivedSignature,
      expectedSignature
    )
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8")
    );

    if (
      typeof payload.userId !== "string" ||
      typeof payload.nonce !== "string" ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}


export function createGoogleOAuthAttemptData(userId) {
  const state = createGoogleOAuthState(userId);
  const payload = verifyGoogleOAuthState(state);

  if (!payload) {
    throw new Error(
      "Google OAuth: State konnte nicht erstellt werden."
    );
  }

  return {
    state,
    nonce: payload.nonce,
    userId: payload.userId,
    expiresAt: payload.expiresAt,
  };
}

