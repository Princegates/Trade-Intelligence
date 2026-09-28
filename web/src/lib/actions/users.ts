"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { actorOf, logActivity } from "@/lib/activity-log";
import { diffFields } from "@/lib/activity-log-view";
import { getAccessPolicy } from "@/lib/access-policy";
import type { Role } from "@/lib/supabase/types";

export async function setUserRole(userId: string, role: Role) {
  const admin = await requireAdmin();

  if (!isSupabaseConfigured()) return { error: "Demo mode: role changes aren't persisted." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { data: before } = await supabase.from("profiles").select("role, email").eq("id", userId).maybeSingle();

  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };

  logActivity({
    action: "admin.user_role_changed",
    actor: actorOf(admin),
    target: { type: "user", id: userId, label: before?.email ?? null },
    details: { changes: diffFields({ Role: before?.role }, { Role: role }) },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function setUserApproval(userId: string, approved: boolean) {
  const admin = await requireAdmin();

  if (!isSupabaseConfigured()) return { error: "Demo mode: approval changes aren't persisted." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  // Approving grants a fresh trial window starting now — including on a
  // re-approval after a revoke, rather than leaving whatever expiry (if any)
  // was left over from before.
  const update: { approved: boolean; full_access_until?: string } = { approved };
  let trialDays: number | null = null;
  if (approved) {
    ({ trialDays } = await getAccessPolicy());
    update.full_access_until = new Date(Date.now() + trialDays * 24 * 3600 * 1000).toISOString();
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", userId);
  if (error) return { error: error.message };

  logActivity({
    action: approved ? "admin.user_approved" : "admin.user_approval_revoked",
    actor: actorOf(admin),
    target: { type: "user", id: userId },
    details: trialDays === null ? {} : { trial_days: trialDays },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easy to read aloud or type
  const part = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `${part()}-${part()}`;
}

export interface AccessCodeResult {
  error?: string;
  code?: string;
  expiresAt?: string;
}

/** Generates a one-time, per-person unlock code the admin sends the user
 * out of band (there is no in-app way to view someone else's code — see
 * 0011_trial_access.sql). Any earlier unredeemed code for the same person
 * is invalidated first, so only the most recently issued code ever works.
 * The code itself expires after the site's codeExpiryDays setting
 * (0013_access_code_expiry.sql) if it's never redeemed. */
export async function generateAccessCode(userId: string): Promise<AccessCodeResult> {
  const admin = await requireAdmin();

  if (!isSupabaseConfigured()) return { error: "Demo mode: codes aren't persisted." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  await supabase.from("access_codes").delete().eq("user_id", userId).is("redeemed_at", null);

  const { codeExpiryDays } = await getAccessPolicy();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + codeExpiryDays * 24 * 3600 * 1000).toISOString();

  const { error } = await supabase
    .from("access_codes")
    .insert({ user_id: userId, code, created_by: admin.id, expires_at: expiresAt });
  if (error) return { error: error.message };

  // The code itself stays out of the log — anyone reading the log could
  // otherwise redeem it.
  logActivity({
    action: "admin.access_code_generated",
    actor: actorOf(admin),
    target: { type: "user", id: userId },
    details: { code_expires: expiresAt.slice(0, 10) },
  });

  revalidatePath("/admin/users");
  return { code, expiresAt };
}
