import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

interface EmailProvider {
  provider: string;
  config: Record<string, string>;
}

/** Mirrors ai-settings.ts#getActiveAiProvider — reads through the
 * service-role client since app_settings is admin-only RLS and this is
 * called from ordinary (non-admin) request paths like signup. */
async function getActiveEmailProvider(): Promise<EmailProvider | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("app_settings")
    .select("provider, config")
    .eq("category", "email")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { provider: data.provider, config: (data.config as Record<string, string>) ?? {} };
}

interface SendEmailInput {
  to: string[];
  subject: string;
  html: string;
}

/** Sends through whichever email provider is active in /admin/settings.
 * Only Resend is actually wired up to send right now — SendGrid, Postmark,
 * and SES are listed as configurable providers (see demo-data.ts's
 * SETTINGS_PROVIDERS.email) but not implemented here yet, so an admin who
 * activates one of those gets a logged no-op rather than a silent failure
 * that looks like it worked.
 *
 * Never throws: an email is always a side effect of some other action
 * (signup, a lead) that must succeed regardless of whether notifying an
 * admin does. */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  if (to.length === 0) return false;

  const provider = await getActiveEmailProvider();
  if (!provider) return false;

  if (provider.provider !== "resend") {
    console.error(`[email] provider "${provider.provider}" is active but not implemented yet`);
    return false;
  }

  const apiKey = provider.config.api_key;
  const from = provider.config.from_address;
  if (!apiKey || !from) return false;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[email] Resend ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
      return false;
    }
    return true;
  } catch (exc) {
    console.error(`[email] Resend request failed: ${exc}`);
    return false;
  }
}

/** Values interpolated into the HTML bodies below come from user input
 * (a signup form, a lead capture form) — escape before embedding, since
 * this is rendered as HTML in the recipient's mail client. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
