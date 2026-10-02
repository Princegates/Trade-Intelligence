"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { actorOf, logActivity } from "@/lib/activity-log";
import { diffFields } from "@/lib/activity-log-view";
import { getAccessPolicy } from "@/lib/access-policy";
import { notifyUserOfAccessCode } from "@/lib/notifications";
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

// Same 1-365 bound actions/access.ts's dayCountSchema already applies to
// the site-wide trialDays/codeExpiryDays settings — this is the same kind
// of input (a day count an admin types in), just scoped to one code.
const accessDaysSchema = z.coerce.number().int().min(1, "Must be at least 1 day.").max(365, "Must be 365 days or fewer.");

export interface AccessCodeResult {
  error?: string;
  code?: string;
  expiresAt?: string;
  accessDays?: number;
  /** Whether notifyUserOfAccessCode actually sent the email — distinct from
   * `error`, since a code can generate successfully with no email provider
   * configured. The admin still sees the code either way to send manually. */
  emailSent?: boolean;
}

/** Generates a one-time, per-person unlock code the admin sends the user
 * out of band (there is no in-app way to view someone else's code again —
 * see 0011_trial_access.sql) and also emails directly to them, best-effort
 * (see notifyUserOfAccessCode). Any earlier unredeemed code for the same
 * person is invalidated first, so only the most recently issued code ever
 * works. The code itself expires after the site's codeExpiryDays setting
 * (0013_access_code_expiry.sql) if it's never redeemed — a separate thing
 * from `accessDays`, which is how many days of *access* redeeming it grants
 * this specific person, chosen by the admin per code rather than always
 * using the site-wide trialDays default (0035_access_code_custom_days.sql). */
export async function generateAccessCode(userId: string, accessDays: number): Promise<AccessCodeResult> {
  const admin = await requireAdmin();

  const parsedDays = accessDaysSchema.safeParse(accessDays);
  if (!parsedDays.success) return { error: parsedDays.error.issues[0]?.message ?? "Invalid number of days." };

  if (!isSupabaseConfigured()) return { error: "Demo mode: codes aren't persisted." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { data: target } = await supabase.from("profiles").select("email, full_name").eq("id", userId).maybeSingle();

  await supabase.from("access_codes").delete().eq("user_id", userId).is("redeemed_at", null);

  const { codeExpiryDays } = await getAccessPolicy();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + codeExpiryDays * 24 * 3600 * 1000).toISOString();

  const { error } = await supabase
    .from("access_codes")
    .insert({ user_id: userId, code, created_by: admin.id, expires_at: expiresAt, access_days: parsedDays.data });
  if (error) return { error: error.message };

  // The code itself stays out of the log — anyone reading the log could
  // otherwise redeem it.
  logActivity({
    action: "admin.access_code_generated",
    actor: actorOf(admin),
    target: { type: "user", id: userId },
    details: { code_expires: expiresAt.slice(0, 10), access_days: parsedDays.data },
  });

  revalidatePath("/admin/users");

  const emailSent = target?.email
    ? await notifyUserOfAccessCode(target.email, target.full_name, code, expiresAt, parsedDays.data)
    : false;

  return { code, expiresAt, accessDays: parsedDays.data, emailSent };
}

function generateTemporaryPassword(): string {
  // Same "easy to read aloud or type" alphabet as generateCode() above,
  // widened with lowercase too (a temporary password, unlike an access
  // code, isn't typed into a single short field people eyeball character
  // by character) and long enough to clear every password-strength floor
  // this app sets elsewhere (signup/change-password both require 8+).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // no 0/O/1/l/I
  return Array.from({ length: 12 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export interface ResetPasswordResult {
  error?: string;
  temporaryPassword?: string;
}

/** Sets a random temporary password for a user's account and forces a
 * change on their next login (profiles.must_change_password — see
 * 0032_force_password_reset.sql and src/lib/auth.ts#requireUser). The
 * password itself is returned once, for the admin to send out of band,
 * same never-stored-plaintext-after-this-call shape generateAccessCode()
 * above already uses — there is no way to look it up again afterward, by
 * the admin or anyone else.
 *
 * Needs the service-role client specifically for auth.admin.updateUserById
 * — that's a privileged Auth API call, not a table RLS would otherwise
 * gate, so there's no regular-client equivalent. The must_change_password
 * write right after it uses the ordinary cookie-scoped client instead,
 * same as every other admin action in this file, keeping the service-role
 * client's use narrow and only where it's actually required. */
export async function resetUserPassword(userId: string): Promise<ResetPasswordResult> {
  const admin = await requireAdmin();

  if (!isSupabaseConfigured()) return { error: "Demo mode: password resets aren't persisted." };

  const serviceClient = createServiceClient();
  if (!serviceClient) return { error: "Could not connect to Supabase (missing service role key)." };

  const temporaryPassword = generateTemporaryPassword();

  const { error: authError } = await serviceClient.auth.admin.updateUserById(userId, { password: temporaryPassword });
  if (authError) return { error: authError.message };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { error: profileError } = await supabase.from("profiles").update({ must_change_password: true }).eq("id", userId);
  if (profileError) return { error: profileError.message };

  // The password itself stays out of the log, same reasoning as access codes.
  logActivity({
    action: "admin.user_password_reset",
    actor: actorOf(admin),
    target: { type: "user", id: userId },
  });

  revalidatePath("/admin/users");
  return { temporaryPassword };
}

export interface DeleteUserResult {
  error?: string;
  success?: true;
}

/** Permanently deletes a user's auth account. profiles cascades from
 * auth.users (0001_init.sql, `on delete cascade`), and every other table
 * that could otherwise block the delete (settings' updated_by,
 * access_codes.created_by) was relaxed to ON DELETE SET NULL specifically
 * for this (0033_allow_user_deletion.sql) — access_codes.user_id already
 * cascaded correctly on its own. Irreversible: there is no recovery once
 * this returns success, which is why the UI (DeleteUserButton) puts a
 * confirmation dialog in front of it rather than a single click. */
export async function deleteUser(userId: string): Promise<DeleteUserResult> {
  const admin = await requireAdmin();

  if (!isSupabaseConfigured()) return { error: "Demo mode: deletions aren't persisted." };

  if (userId === admin.id) {
    return { error: "You can't delete your own account while signed in as it." };
  }

  const serviceClient = createServiceClient();
  if (!serviceClient) return { error: "Could not connect to Supabase (missing service role key)." };

  // Read who this was before the row is gone — nothing to look up afterward.
  const { data: target } = await serviceClient.from("profiles").select("email").eq("id", userId).maybeSingle();

  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  logActivity({
    action: "admin.user_deleted",
    actor: actorOf(admin),
    target: { type: "user", id: userId, label: target?.email ?? null },
  });

  revalidatePath("/admin/users");
  return { success: true };
}
