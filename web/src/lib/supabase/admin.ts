import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";
import type { Database } from "./types";

/** Service-role client. Bypasses Row Level Security — never import this
 * from a Client Component, and never return its results directly to the
 * client without filtering. Used only for privileged admin operations
 * (e.g. listing/managing auth users). Returns null in demo mode or if
 * SUPABASE_SERVICE_ROLE_KEY isn't set. */
export function createAdminClient() {
  const env = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceRoleKey) return null;

  return createSupabaseClient<Database>(env.url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
