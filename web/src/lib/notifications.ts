import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, escapeHtml } from "@/lib/email";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function getAdminEmails(): Promise<string[]> {
  const supabase = createServiceClient();
  if (!supabase) return [];

  const { data } = await supabase.from("profiles").select("email").eq("role", "admin");
  return (data ?? []).map((row) => row.email).filter((email): email is string => Boolean(email));
}

/** Fired once, right after a new account is created — without this, a
 * sign-up sits on /pending until an admin happens to check /admin/users,
 * with nothing prompting them to look. Never throws and never blocks
 * signup: a missing/misconfigured email provider (sendEmail's own fallback)
 * just means no notification goes out, not a failed signup. */
export async function notifyAdminsOfNewSignup(email: string, fullName: string): Promise<void> {
  const admins = await getAdminEmails();
  if (admins.length === 0) return;

  await sendEmail({
    to: admins,
    subject: "New sign-up waiting for approval",
    html: `<p><strong>${escapeHtml(fullName)}</strong> (${escapeHtml(email)}) just signed up and is waiting for approval.</p><p><a href="${SITE_URL}/admin/users">Review in Access Control</a></p>`,
  });
}

/** Fired when a visitor submits the pricing page's access-request form or
 * the homepage waitlist form (see actions/leads.ts). Same fail-open
 * behavior as notifyAdminsOfNewSignup — the lead is already saved to the
 * leads table regardless of whether this succeeds. */
export async function notifyAdminsOfNewLead(
  kind: "waitlist" | "access_request",
  email: string,
  name: string | null,
  note: string | null
): Promise<void> {
  const admins = await getAdminEmails();
  if (admins.length === 0) return;

  const label = kind === "waitlist" ? "Waitlist signup" : "Access request";
  const namePart = name ? `<strong>${escapeHtml(name)}</strong> (${escapeHtml(email)})` : escapeHtml(email);
  const notePart = note ? `<p>${escapeHtml(note)}</p>` : "";

  await sendEmail({
    to: admins,
    subject: `${label}: ${email}`,
    html: `<p>${label} from ${namePart}.</p>${notePart}`,
  });
}
