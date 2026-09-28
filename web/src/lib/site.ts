// Shared site-wide constants for anything that needs the brand name,
// description, or canonical URL — root metadata, sitemap.ts, robots.ts,
// opengraph-image.tsx, and any page's own JSON-LD — so they can't drift
// into disagreeing with each other.

export const SITE_NAME = "SignalsVault AI";

export const SITE_DESCRIPTION =
  "Trade intelligence for BTC and gold: rule-based signals with the reasoning behind every call, each one followed as a real trade.";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Where users get an access code — WhatsApp only, shown on the dashboard's
// Settings page. The link needs the number in international form (Ghana,
// +233, without the leading 0).
export const ADMIN_WHATSAPP = { display: "0596909643", international: "233596909643" };

/** Opens a WhatsApp chat with the admin, message pre-filled. With the
 * account email the admin knows whose code to make; without it (a card
 * that doesn't know who's viewing) the message ends where the user types it. */
export function adminWhatsAppUrl(email?: string | null): string {
  const text = `Hi, I'd like an access code to unlock premium on ${SITE_NAME}. My account email is${email ? ` ${email}.` : " "}`;
  return `https://wa.me/${ADMIN_WHATSAPP.international}?text=${encodeURIComponent(text)}`;
}
