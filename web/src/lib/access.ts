// Pure trial-access helpers — no Supabase import here on purpose, so a
// client component (e.g. the header badge in dashboard-shell.tsx) can use
// these directly without pulling a server-only module into the client
// bundle. The one piece of this that actually touches the database — the
// site-wide trial length — lives in access-policy.ts instead.

export interface AccessSubject {
  role: "user" | "admin";
  fullAccessUntil: string | null;
}

/** Admins always have full access. Everyone else needs a
 * `full_access_until` in the future — null or past means basic view
 * (latest signal only, no history; see src/lib/signals.ts). */
export function hasFullAccess(user: AccessSubject, now: number = Date.now()): boolean {
  if (user.role === "admin") return true;
  if (!user.fullAccessUntil) return false;
  return new Date(user.fullAccessUntil).getTime() > now;
}

/** Whole days left on the trial, or null if there's no expiry to count down
 * (admin, or never had one). Never negative — an expired trial is 0, not a
 * negative countdown. */
export function daysRemaining(user: AccessSubject, now: number = Date.now()): number | null {
  if (user.role === "admin" || !user.fullAccessUntil) return null;
  const ms = new Date(user.fullAccessUntil).getTime() - now;
  return Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
}
