
import prisma from "../db.server";
import { encryptGoogleToken } from "./google-token-crypto.server";

const ALLOWED_SHOP = "0yr6cb-b4.myshopify.com";

export async function saveGoogleAdsConnection({
  shop,
  userId,
  refreshToken,
}) {
  const allowedUserId =
    process.env.GOOGLE_ADS_ADMIN_USER_ID;

  if (
    shop?.toLowerCase() !== ALLOWED_SHOP ||
    !allowedUserId ||
    String(userId) !== String(allowedUserId)
  ) {
    throw new Error(
      "Google Ads: Keine Administratorberechtigung."
    );
  }

  if (
    typeof refreshToken !== "string" ||
    !refreshToken
  ) {
    throw new Error(
      "Google Ads: Gültiges Refresh-Token fehlt."
    );
  }

  const encryptedRefreshToken =
    encryptGoogleToken(refreshToken);

  return prisma.googleAdsConnection.upsert({
    where: {
      shop: ALLOWED_SHOP,
    },
    create: {
      shop: ALLOWED_SHOP,
      userId: String(userId),
      encryptedRefreshToken,
      status: "connected",
    },
    update: {
      userId: String(userId),
      encryptedRefreshToken,
      status: "connected",
      connectedAt: new Date(),
    },
    select: {
      id: true,
      shop: true,
      status: true,
      connectedAt: true,
    },
  });
}
