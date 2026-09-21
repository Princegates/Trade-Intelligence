"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export interface AuthFormState {
  error?: string;
  info?: string;
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

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };

  // If email confirmation is off in the Supabase project, signUp already
  // returns a session and the user is signed in immediately.
  if (data.session) redirect("/dashboard");

  return { info: "Check your email to confirm your account before signing in." };
}

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
