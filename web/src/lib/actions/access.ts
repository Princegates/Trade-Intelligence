"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export interface RedeemFormState {
  error?: string;
  success?: boolean;
}

const codeSchema = z.string().trim().min(1, "Enter the code your admin gave you.");

/** Redeems an access code for the signed-in user's own account, extending
 * their trial. Delegates the actual match-and-update to the
 * redeem_access_code() Postgres function (security definer) rather than
 * updating profiles/access_codes directly — see 0011_trial_access.sql for
 * why: it lets a user redeem their own code without ever being granted
 * UPDATE on either table. */
export async function redeemAccessCode(_prevState: RedeemFormState, formData: FormData): Promise<RedeemFormState> {
  await requireUser();

  const parsed = codeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  if (!isSupabaseConfigured()) return { error: "Demo mode: codes can't be redeemed here." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { data, error } = await supabase.rpc("redeem_access_code", { p_code: parsed.data.toUpperCase() });
  if (error) return { error: error.message };
  if (!data) return { error: "That code is invalid or has already been used." };

  revalidatePath("/dashboard", "layout");
  return { success: true };
}

export interface AccessPolicyFormState {
  error?: string;
  success?: boolean;
}

const dayCountSchema = z.coerce.number().int().min(1, "Must be at least 1 day.").max(365, "Must be 365 days or fewer.");

export async function setAccessPolicy(
  _prevState: AccessPolicyFormState,
  formData: FormData
): Promise<AccessPolicyFormState> {
  const admin = await requireAdmin();

  const trialDays = dayCountSchema.safeParse(formData.get("trialDays"));
  if (!trialDays.success) return { error: trialDays.error.issues[0]?.message ?? "Invalid input." };

  const codeExpiryDays = dayCountSchema.safeParse(formData.get("codeExpiryDays"));
  if (!codeExpiryDays.success) return { error: codeExpiryDays.error.issues[0]?.message ?? "Invalid input." };

  if (!isSupabaseConfigured()) return { error: "Demo mode: policy changes aren't saved." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { error } = await supabase
    .from("access_policy")
    .update({
      trial_days: trialDays.data,
      code_expiry_days: codeExpiryDays.data,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { success: true };
}
