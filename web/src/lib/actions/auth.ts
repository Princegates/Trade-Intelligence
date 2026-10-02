"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { notifyAdminsOfNewSignup } from "@/lib/notifications";
import { logActivity } from "@/lib/activity-log";

export interface AuthFormState {
  error?: string;
  info?: string;
  /** Set alongside `info` on a successful signup that needs email
   * confirmation — the form echoes it back in the "check your email"
   * state so the user sees which address to check, same as /pending
   * shows the signed-in user's own email. */
  email?: string;
}

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const DEMO_MODE_MESSAGE =
  "Demo mode: Supabase isn't configured yet, so accounts can't be created. You can still open /dashboard or /admin directly to explore the UI.";

export async function login(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { info: DEMO_MODE_MESSAGE };

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  if (!supabase) return { info: DEMO_MODE_MESSAGE };

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Failed attempts are logged too — repeated ones against one address
    // are what an admin would look for.
    logActivity({
      action: "auth.sign_in_failed",
      actor: { id: null, email: parsed.data.email },
      outcome: "failure",
      details: { reason: error.message },
    });
    return { error: error.message };
  }
  logActivity({ action: "auth.signed_in", actor: { id: data.user.id, email: data.user.email ?? parsed.data.email } });

  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/dashboard");
}

const signupSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(1, "Enter your name.").max(120),
});

export async function signup(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { info: DEMO_MODE_MESSAGE };

  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  if (!supabase) return { info: DEMO_MODE_MESSAGE };

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) {
    logActivity({
      action: "auth.signed_up",
      actor: { id: null, email: parsed.data.email },
      outcome: "failure",
      details: { reason: error.message },
    });
    return { error: error.message };
  }
  logActivity({
    action: "auth.signed_up",
    actor: { id: data.user?.id ?? null, email: parsed.data.email, role: "user" },
    details: { name: parsed.data.fullName },
  });

  // The 0001_init.sql trigger has already created the (unapproved) profile
  // row by this point. Without this, a sign-up sits on /pending until an
  // admin happens to check /admin/users — nothing else prompts them to
  // look. Never throws; a down/unconfigured email provider just means no
  // notification goes out, not a failed signup.
  await notifyAdminsOfNewSignup(parsed.data.email, parsed.data.fullName);

  // If email confirmation is off in the Supabase project, signUp already
  // returns a session and the user is signed in immediately.
  if (data.session) redirect("/dashboard");

  return { info: "Check your email to confirm your account before signing in.", email: parsed.data.email };
}

export async function signOut() {
  const supabase = await createClient();
  if (supabase) {
    // Read before signing out — afterwards there's no session to say who it was.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.auth.signOut();
    if (user) logActivity({ action: "auth.signed_out", actor: { id: user.id, email: user.email ?? null } });
  }
  redirect("/");
}
