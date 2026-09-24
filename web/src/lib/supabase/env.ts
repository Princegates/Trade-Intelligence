const REST_SUFFIX = "/rest/v1";

// The Supabase dashboard shows the project URL bare in Settings, but with
// /rest/v1 already appended in the API docs page, so either is a
// reasonable thing to paste into NEXT_PUBLIC_SUPABASE_URL — the alternative
// is every request going to a malformed, doubled-up path (createClient()
// appends /rest/v1, /auth/v1, etc. itself) that fails with nothing useful
// to go on, silently breaking login. Same normalization as
// src/storage/supabase.py#_credentials() on the Python side, for the same
// reason.
export function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith(REST_SUFFIX) ? trimmed.slice(0, -REST_SUFFIX.length) : trimmed;
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url: normalizeUrl(url), anonKey };
}

/** True once real Supabase credentials are configured. Until then, pages
 * fall back to demo data (see src/lib/demo-data.ts) instead of erroring. */
export function isSupabaseConfigured() {
  return getSupabaseEnv() !== null;
}
