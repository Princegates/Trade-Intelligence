import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { normalizeUrl } from "./env";
import type { Database } from "./types";

/** service_role client — bypasses RLS entirely, the same way the Python
 * cron job's SUPABASE_SERVICE_ROLE_KEY already does (see
 * src/storage/supabase.py). Only ever used server-side, and only for the
 * narrow case where an ordinary signed-in user's own request legitimately
 * needs something RLS would otherwise block them from reading directly —
 * right now, just the AI provider's config for the chat feature (see
 * src/lib/ai-settings.ts), since app_settings itself is admin-only RLS and
 * the chat is available to every signed-in user, not just admins.
 *
 * Never import this from a "use client" file, and never return its data
 * unfiltered to the browser — the whole point is that the service role key
 * itself, and anything gated behind it, stays server-side. */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createSupabaseClient<Database>(normalizeUrl(url), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
