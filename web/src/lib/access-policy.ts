import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const DEFAULT_TRIAL_DAYS = 7;
const DEFAULT_CODE_EXPIRY_DAYS = 3;

export interface AccessPolicy {
  /** How many days of full access a newly-approved account (or a redeemed
   * code) grants. Admin-controlled, see /admin/settings. */
  trialDays: number;
  /** How many days after generation an access code stays redeemable, before
   * the admin has to issue a fresh one. Distinct from trialDays — this is
   * the code's own deadline, not how long access lasts once redeemed.
   * Admin-controlled, see /admin/settings. */
  codeExpiryDays: number;
}

export async function getAccessPolicy(): Promise<AccessPolicy> {
  if (!isSupabaseConfigured()) return { trialDays: DEFAULT_TRIAL_DAYS, codeExpiryDays: DEFAULT_CODE_EXPIRY_DAYS };

  const supabase = await createClient();
  if (!supabase) return { trialDays: DEFAULT_TRIAL_DAYS, codeExpiryDays: DEFAULT_CODE_EXPIRY_DAYS };

  const { data } = await supabase
    .from("access_policy")
    .select("trial_days, code_expiry_days")
    .eq("id", true)
    .maybeSingle();

  return {
    trialDays: data?.trial_days ?? DEFAULT_TRIAL_DAYS,
    codeExpiryDays: data?.code_expiry_days ?? DEFAULT_CODE_EXPIRY_DAYS,
  };
}
