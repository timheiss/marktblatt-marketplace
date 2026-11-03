
import crypto from "node:crypto";
import prisma from "../db.server";
import { encryptGoogleOAuthState } from "./google-oauth-state-crypto.server";
import { verifyGoogleOAuthState } from "./google-oauth-state.server";
import { decryptGoogleOAuthState } from "./google-oauth-state-crypto.server";

export async function saveGoogleOAuthAttempt({
  state,
  nonce,
  userId,
  shop,
  expiresAt,
}) {
  const payload = verifyGoogleOAuthState(state);

  if (
    !payload ||
    payload.nonce !== nonce ||
    payload.userId !== String(userId) ||
    payload.expiresAt !== expiresAt
  ) {
    throw new Error(
      "Google OAuth: State und Anmeldeversuch stimmen nicht überein."
    );
  }

  const nonceHash = crypto
    .createHash("sha256")
    .update(nonce)
    .digest("hex");

  const encryptedState = encryptGoogleOAuthState(state);

  return prisma.googleOAuthAttempt.create({
    data: {
      nonceHash,
      encryptedState,
      userId: String(userId),
      shop: String(shop).toLowerCase(),
      expiresAt: new Date(expiresAt),
    },
  });
}

export async function consumeGoogleOAuthAttempt({
  nonce,
  userId,
  shop,
}) {
  const nonceHash = crypto
    .createHash("sha256")
    .update(nonce)
    .digest("hex");

  const now = new Date();

  const result = await prisma.googleOAuthAttempt.updateMany({
    where: {
      nonceHash,
      userId: String(userId),
      shop: String(shop).toLowerCase(),
      usedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      usedAt: now,
    },
  });

  return result.count === 1;
}

export async function createGoogleOAuthLaunchToken({
  nonce,
  userId,
  shop,
}) {
  const launchToken = crypto.randomBytes(32).toString("base64url");

  const nonceHash = crypto
    .createHash("sha256")
    .update(nonce)
    .digest("hex");

  const launchTokenHash = crypto
    .createHash("sha256")
    .update(launchToken)
    .digest("hex");

  const now = new Date();

  const result = await prisma.googleOAuthAttempt.updateMany({
    where: {
      nonceHash,
      userId: String(userId),
      shop: String(shop).toLowerCase(),
      usedAt: null,
      launchTokenHash: null,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      launchTokenHash,
    },
  });

  if (result.count !== 1) {
    throw new Error(
      "Google OAuth: Startnachweis konnte nicht erstellt werden."
    );
  }

  return launchToken;
}

export async function consumeGoogleOAuthLaunchToken({
  launchToken,
}) {
  if (
    typeof launchToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(launchToken)
  ) {
    return null;
  }

  const launchTokenHash = crypto
    .createHash("sha256")
    .update(launchToken)
    .digest("hex");

  const now = new Date();

  const attempt = await prisma.googleOAuthAttempt.findUnique({
    where: {
      launchTokenHash,
    },
  });

  if (
    !attempt ||
    attempt.usedAt ||
    attempt.launchConsumedAt ||
    !attempt.encryptedState ||
    attempt.expiresAt <= now ||
    attempt.createdAt.getTime() + 2 * 60 * 1000 <= now.getTime()
  ) {
    return null;
  }

  let state;
  let payload;

  try {
    state = decryptGoogleOAuthState(attempt.encryptedState);
    payload = verifyGoogleOAuthState(state);
  } catch {
    return null;
  }

  if (
    !payload ||
    payload.userId !== attempt.userId ||
    payload.expiresAt !== attempt.expiresAt.getTime()
  ) {
    return null;
  }

  const nonceHash = crypto
    .createHash("sha256")
    .update(payload.nonce)
    .digest("hex");

  if (nonceHash !== attempt.nonceHash) {
    return null;
  }

  const result = await prisma.googleOAuthAttempt.updateMany({
    where: {
      id: attempt.id,
      launchTokenHash,
      usedAt: null,
      launchConsumedAt: null,
      expiresAt: {
        gt: now,
      },
      createdAt: {
        gt: new Date(now.getTime() - 2 * 60 * 1000),
      },
    },
    data: {
      launchConsumedAt: now,
    },
  });

  if (result.count !== 1) {
    return null;
  }

  return {
    userId: attempt.userId,
    shop: attempt.shop,
    state,
    nonce: payload.nonce,
  };
}