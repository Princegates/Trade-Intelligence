import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export interface GudaSpecialSettings {
  /** Whether the GUDA SPECIAL signal card is shown to users on the
   * dashboard — a pure display gate (src/signals/setups.py keeps running
   * and publishing regardless). See web/supabase/migrations/
   * 0023_guda_special_enabled_toggle.sql. */
  enabled: boolean;
}

/** Two distinct fallbacks, not one default — matches how every other live
 * reader in this codebase (e.g. getLatestSignals()) distinguishes "demo
 * mode" from "a real, configured project that failed to answer":
 *
 * - Supabase isn't configured at all (demo mode): `enabled: true`. Demo
 *   mode exists to showcase the full product to someone evaluating it
 *   without real credentials — same reason DEMO_SIGNALS is always fully
 *   populated rather than empty.
 * - Supabase IS configured but this query fails or the row is missing:
 *   `enabled: false`. A real failure fails safe to hidden, never shown. */
export async function getGudaSpecialSettings(): Promise<GudaSpecialSettings> {
  if (!isSupabaseConfigured()) return { enabled: true };

  const supabase = await createClient();
  if (!supabase) return { enabled: false };

  const { data } = await supabase.from("guda_special_settings").select("enabled").eq("id", true).maybeSingle();

  return { enabled: data?.enabled ?? false };
}
