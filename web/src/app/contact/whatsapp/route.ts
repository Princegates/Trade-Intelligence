import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { adminWhatsAppUrl } from "@/lib/admin-contact";

// Per-viewer: the pre-filled message carries the signed-in user's email.
export const dynamic = "force-dynamic";

/** Target of every "Chat with admin" button — see admin-whatsapp-link.tsx. */
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.redirect(adminWhatsAppUrl(user?.email));
}
