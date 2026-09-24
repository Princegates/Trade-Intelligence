import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const DEFAULT_TRIAL_DAYS = 7;

export interface AccessPolicy {
  /** How many days of full access a newly-approved account (or a redeemed
   * code) grants. Admin-controlled, see /admin/settings. */
  trialDays: number;
}

export async function getAccessPolicy(): Promise<AccessPolicy> {
  if (!isSupabaseConfigured()) return { trialDays: DEFAULT_TRIAL_DAYS };

  const supabase = await createClient();
  if (!supabase) return { trialDays: DEFAULT_TRIAL_DAYS };

  const { data } = await supabase.from("access_policy").select("trial_days").eq("id", true).maybeSingle();

  return { trialDays: data?.trial_days ?? DEFAULT_TRIAL_DAYS };
}
