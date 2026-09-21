export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** True once real Supabase credentials are configured. Until then, pages
 * fall back to demo data (see src/lib/demo-data.ts) instead of erroring. */
export function isSupabaseConfigured() {
  return getSupabaseEnv() !== null;
}
