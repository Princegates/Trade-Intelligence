import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";
import type { Database } from "./types";

/** Browser client. Returns null in demo mode (no Supabase env vars set). */
export function createClient() {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createBrowserClient<Database>(env.url, env.anonKey);
}
