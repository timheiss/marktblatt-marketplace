
import { authenticate } from "../shopify.server";

const ALLOWED_SHOP = "0yr6cb-b4.myshopify.com";

export async function authenticateAdsAdmin(request) {
  const { session, sessionToken } =
    await authenticate.admin(request);

  if (session?.shop?.toLowerCase() !== ALLOWED_SHOP) {
    throw new Response(
      "Zugriff verweigert: Ungültiger Shopify-Shop.",
      { status: 403 }
    );
  }

  const allowedUserId =
    process.env.GOOGLE_ADS_ADMIN_USER_ID;

  const currentUserId = sessionToken?.sub;
console.info("Google Ads Admin Diagnose", {
  shopValid: session?.shop?.toLowerCase() === ALLOWED_SHOP,
  sessionTokenPresent: Boolean(sessionToken),
  userIdPresent: Boolean(currentUserId),
  currentUserId: String(currentUserId),
  userIdMatches:
    Boolean(allowedUserId) &&
    Boolean(currentUserId) &&
    String(currentUserId) === String(allowedUserId),
});

  if (
    !allowedUserId ||
    !currentUserId ||
    String(currentUserId) !== String(allowedUserId)
  ) {
    throw new Response(
      "Zugriff verweigert: Keine Google-Ads-Administratorberechtigung.",
      { status: 403 }
    );
  }

  return { session };
}
