"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { actorOf, logActivity } from "@/lib/activity-log";
import { diffFields } from "@/lib/activity-log-view";

export interface ProfileFormState {
  error?: string;
  success?: boolean;
}

const DEMO_MESSAGE = "Demo mode: changes here aren't persisted.";

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name.").max(120),
});

/** Updates the signed-in user's own display name. Works the same for a
 * regular user or an admin — both call this from their own /profile page,
 * scoped to their own row via requireUser() + eq("id", user.id). */
export async function updateProfile(_prevState: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({ fullName: formData.get("fullName") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  if (!isSupabaseConfigured()) return { error: DEMO_MESSAGE };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { error } = await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", user.id);
  if (error) return { error: error.message };

  logActivity({
    action: "account.name_changed",
    actor: actorOf(user),
    details: { changes: diffFields({ Name: user.fullName }, { Name: parsed.data.fullName }) },
  });

  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
  return { success: true };
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match.",
    path: ["confirmPassword"],
  });

/** Changes the signed-in user's own password. Re-authenticates with the
 * current password first — a session alone shouldn't be enough to take over
 * the account if someone's left it unlocked. */
export async function updatePassword(_prevState: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await requireUser();

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  if (!isSupabaseConfigured()) return { error: DEMO_MESSAGE };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) {
    logActivity({
      action: "account.password_changed",
      actor: actorOf(user),
      outcome: "failure",
      details: { reason: "Current password was incorrect" },
    });
    return { error: "Current password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    logActivity({ action: "account.password_changed", actor: actorOf(user), outcome: "failure", details: { reason: error.message } });
    return { error: error.message };
  }

  logActivity({ action: "account.password_changed", actor: actorOf(user) });
  return { success: true };
}

/** The forced-change counterpart to updatePassword above, for
 * /change-password only. Deliberately calls getSessionUser() rather than
 * requireUser() — requireUser() redirects anyone with must_change_password
 * set straight back to /change-password, so calling it from the action
 * this exact page's form submits to would loop (same reasoning /pending's
 * own page already documents for the same reason). "Current password"
 * here is the temporary one the admin issued; re-authenticating with it
 * first is the same safety property updatePassword's own re-auth gives —
 * a session alone (even one newly started with the temp password)
 * shouldn't be enough on its own if the field is left blank or guessed. */
export async function changeForcedPassword(_prevState: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard"); // nothing forced here anymore

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  if (!isSupabaseConfigured()) return { error: DEMO_MESSAGE };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) {
    logActivity({
      action: "account.password_changed",
      actor: actorOf(user),
      outcome: "failure",
      details: { reason: "Temporary password was incorrect" },
    });
    return { error: "That temporary password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    logActivity({ action: "account.password_changed", actor: actorOf(user), outcome: "failure", details: { reason: error.message } });
    return { error: error.message };
  }

  await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);

  logActivity({ action: "account.password_changed", actor: actorOf(user), details: { forced: true } });
  redirect("/dashboard");
}
