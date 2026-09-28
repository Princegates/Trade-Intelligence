import "server-only";
import { SITE_NAME } from "@/lib/site";

// Where users get an access code — WhatsApp only. Server-only on purpose:
// pages link to /contact/whatsapp, which redirects here, so the number never
// appears on a page, in its HTML, or in a link's hover preview. The link
// needs the number in international form (Ghana, +233, without the leading 0).
const ADMIN_WHATSAPP_INTERNATIONAL = "233596909643";

/** Opens a WhatsApp chat with the admin, message pre-filled. With the
 * account email the admin knows whose code to make; without it (a signed-out
 * visitor) the message ends where the user types it. */
export function adminWhatsAppUrl(email?: string | null): string {
  const text = `Hi, I'd like an access code to unlock premium on ${SITE_NAME}. My account email is${email ? ` ${email}.` : " "}`;
  return `https://wa.me/${ADMIN_WHATSAPP_INTERNATIONAL}?text=${encodeURIComponent(text)}`;
}
