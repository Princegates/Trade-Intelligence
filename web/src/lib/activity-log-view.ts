// Pure helpers for the system log — no Supabase or Next imports, so the
// labels, filters and formatting are unit-testable and shared by the
// writer (activity-log.ts), the /admin/logs page and its CSV export.

import type { ActivityOutcome } from "@/lib/supabase/types";

export const ACTIVITY_CATEGORIES = [
  { key: "auth", label: "Sign-in & sign-up" },
  { key: "account", label: "Account" },
  { key: "chat", label: "Guda chat" },
  { key: "lead", label: "Lead forms" },
  { key: "admin", label: "Admin changes" },
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]["key"];

/** Every action the platform records. The key's prefix is its category —
 * the filter on /admin/logs matches on it — so a new action only needs a
 * line here. */
export const ACTIVITY_ACTIONS = {
  "auth.signed_up": "Signed up",
  "auth.signed_in": "Signed in",
  "auth.sign_in_failed": "Failed to sign in",
  "auth.signed_out": "Signed out",
  "auth.email_confirmed": "Confirmed their email",
  "account.name_changed": "Changed their display name",
  "account.password_changed": "Changed their password",
  "account.access_code_redeemed": "Redeemed an access code",
  "chat.message_sent": "Sent a message to Guda",
  "lead.waitlist_joined": "Joined the waitlist",
  "lead.access_requested": "Requested full access",
  "admin.user_approved": "Approved a user",
  "admin.user_approval_revoked": "Revoked a user's approval",
  "admin.user_role_changed": "Changed a user's role",
  "admin.access_code_generated": "Generated an access code",
  "admin.lead_marked_handled": "Marked a lead handled",
  "admin.lead_reopened": "Reopened a lead",
  "admin.provider_settings_saved": "Saved provider settings",
  "admin.access_policy_changed": "Changed the access policy",
  "admin.engine_settings_changed": "Changed the signal engine settings",
  "admin.appearance_changed": "Changed the site appearance",
  "admin.guda_special_toggled": "Changed GUDA SPECIAL visibility",
  "admin.live_results_toggled": "Changed live-results visibility",
  "admin.news_cache_refreshed": "Refreshed the market news",
  "admin.log_exported": "Exported the system log",
} as const;

export type ActivityAction = keyof typeof ACTIVITY_ACTIONS;

export function actionLabel(action: string): string {
  return (ACTIVITY_ACTIONS as Record<string, string>)[action] ?? action;
}

export function actionCategory(action: string): string {
  return action.split(".")[0] ?? action;
}

export interface ActivityView {
  id: number;
  createdAt: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  details: Record<string, unknown>;
  outcome: ActivityOutcome;
  ip: string | null;
  userAgent: string | null;
}

// --- request metadata -------------------------------------------------------

/** The caller's IP from proxy headers — the first x-forwarded-for hop is
 * the client (Vercel sets it); x-real-ip is the fallback. */
export function clientIp(get: (name: string) => string | null): string | null {
  const forwarded = get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || get("x-real-ip")?.trim() || null;
}

/** "Chrome on Windows" — enough for an admin to tell devices apart
 * without reading a raw user-agent string. Order matters: Edge and Opera
 * also say Chrome, and Chrome also says Safari. */
export function describeUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Other";
}

// --- details ---------------------------------------------------------------

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

/** Only the fields whose value actually changed, keyed by the label the
 * log shows — so "Changed the access policy" can say what changed. */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>): FieldChanges {
  const changes: FieldChanges = {};
  for (const [key, to] of Object.entries(after)) {
    const from = before[key] ?? null;
    if (String(from) !== String(to)) changes[key] = { from, to };
  }
  return changes;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (Array.isArray(v)) return v.length ? v.map(formatValue).join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** One readable line per detail: changed fields as "from → to", anything
 * else as "key: value". */
export function formatDetails(details: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (key === "changes" && value && typeof value === "object") {
      for (const [field, change] of Object.entries(value as FieldChanges)) {
        lines.push(`${field}: ${formatValue(change?.from)} → ${formatValue(change?.to)}`);
      }
      continue;
    }
    const label = key.replace(/_/g, " ");
    lines.push(`${label.charAt(0).toUpperCase()}${label.slice(1)}: ${formatValue(value)}`);
  }
  return lines;
}

// --- filters -----------------------------------------------------------------

export const SINCE_OPTIONS = [
  { key: "24h", label: "Last 24 hours", ms: 24 * 3600 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 3600 * 1000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * 3600 * 1000 },
  { key: "all", label: "All time", ms: null },
] as const;

export interface ActivityFilters {
  q: string;
  category: ActivityCategory | "";
  outcome: ActivityOutcome | "";
  since: (typeof SINCE_OPTIONS)[number]["key"];
  page: number;
}

export const ACTIVITY_PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** Anything unexpected in the URL falls back to the default rather than
 * erroring. `q` is reduced to characters an email or name can contain,
 * since it's spliced into a PostgREST filter string. */
export function parseActivityFilters(params: SearchParams): ActivityFilters {
  const category = first(params.category);
  const outcome = first(params.outcome);
  const since = first(params.since);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).replace(/[^\w@.+\- ]/g, "").slice(0, 100),
    category: ACTIVITY_CATEGORIES.some((c) => c.key === category) ? (category as ActivityCategory) : "",
    outcome: outcome === "success" || outcome === "failure" ? outcome : "",
    since: SINCE_OPTIONS.some((s) => s.key === since) ? (since as ActivityFilters["since"]) : "7d",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function sinceCutoff(since: ActivityFilters["since"], now: number = Date.now()): string | null {
  const ms = SINCE_OPTIONS.find((s) => s.key === since)?.ms ?? null;
  return ms === null ? null : new Date(now - ms).toISOString();
}

/** Same filter the database query applies, for demo mode's in-memory rows. */
export function matchesFilters(row: ActivityView, f: ActivityFilters, now: number = Date.now()): boolean {
  const q = f.q.toLowerCase();
  if (q && ![row.actorEmail, row.targetLabel].some((v) => v?.toLowerCase().includes(q))) return false;
  if (f.category && actionCategory(row.action) !== f.category) return false;
  if (f.outcome && row.outcome !== f.outcome) return false;
  const cutoff = sinceCutoff(f.since, now);
  return !cutoff || row.createdAt >= cutoff;
}

/** The query string for a filter set, dropping defaults so links stay short. */
export function filtersToQuery(f: ActivityFilters, overrides: Partial<ActivityFilters> = {}): string {
  const merged = { ...f, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.category) params.set("category", merged.category);
  if (merged.outcome) params.set("outcome", merged.outcome);
  if (merged.since !== "7d") params.set("since", merged.since);
  if (merged.page > 1) params.set("page", String(merged.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

// --- export ------------------------------------------------------------------

function csvCell(v: string | null | undefined): string {
  const s = v ?? "";
  // Leading =, +, - or @ would run as a formula when opened in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function activityToCsv(rows: ActivityView[]): string {
  const header = ["Time (UTC)", "User", "Role", "Action", "Target", "Details", "Outcome", "IP", "Device"];
  const lines = rows.map((r) =>
    [
      r.createdAt,
      r.actorEmail,
      r.actorRole,
      actionLabel(r.action),
      r.targetLabel ?? r.targetId,
      formatDetails(r.details).join("; "),
      r.outcome,
      r.ip,
      describeUserAgent(r.userAgent),
    ]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...lines].join("\r\n");
}
