import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_USER, DEMO_ADMIN } from "@/lib/demo-data";
import type { Role } from "@/lib/supabase/types";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  approved: boolean;
  /** Full access (every timeframe's full history) until this timestamp;
   * null or past means basic view (latest signal only). Ignored for admins,
   * who always have full access — see src/lib/access.ts#hasFullAccess. */
  fullAccessUntil: string | null;
}

/** Current signed-in user + profile role, or null. In demo mode (no
 * Supabase configured) this always returns null so real pages render their
 * signed-out state — dashboard/admin previews use DEMO_USER/DEMO_ADMIN
 * directly instead, see src/lib/demo-data.ts. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, approved, full_access_until")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? null,
    role: profile?.role ?? "user",
    // No profile row is treated as not approved — deny by default rather
    // than admit by default if the signup trigger somehow hasn't run yet.
    approved: profile?.approved ?? false,
    fullAccessUntil: profile?.full_access_until ?? null,
  };
}

/** Require a signed-in, admin-approved user; redirects a signed-out visitor
 * to /login and an unapproved one to /pending. Admins always pass,
 * regardless of their own `approved` flag. In demo mode, returns a mock
 * signed-in user so /dashboard is browsable without setup. */
export async function requireUser(): Promise<SessionUser> {
  if (!isSupabaseConfigured()) return DEMO_USER;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.approved && user.role !== "admin") redirect("/pending");
  return user;
}

/** Require a signed-in admin; redirects non-admins to /dashboard and signed-out
 * visitors to /login. In demo mode, returns a mock admin so /admin is browsable. */
export async function requireAdmin(): Promise<SessionUser> {
  if (!isSupabaseConfigured()) return DEMO_ADMIN;

  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}
