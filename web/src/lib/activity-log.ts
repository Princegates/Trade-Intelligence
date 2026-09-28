import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_ACTIVITY } from "@/lib/demo-data";
import {
  ACTIVITY_PAGE_SIZE,
  clientIp,
  matchesFilters,
  sinceCutoff,
  type ActivityAction,
  type ActivityFilters,
  type ActivityView,
} from "@/lib/activity-log-view";
import type { SessionUser } from "@/lib/auth";
import type { ActivityOutcome, Database, Role } from "@/lib/supabase/types";

export interface ActivityActor {
  id: string | null;
  email: string | null;
  role?: Role | null;
}

export function actorOf(user: SessionUser): ActivityActor {
  return { id: user.id, email: user.email, role: user.role };
}

export interface ActivityEntry {
  action: ActivityAction;
  /** Who did it — null for a visitor who isn't signed in. */
  actor: ActivityActor | null;
  target?: { type: "user" | "lead" | "setting"; id?: string | null; label?: string | null };
  /** Never passwords, access codes or provider secrets — see the callers. */
  details?: Record<string, unknown>;
  outcome?: ActivityOutcome;
}

/** Records one action in the system log (0027_activity_log.sql). Runs
 * after the response is sent (next/server `after`), so logging never slows
 * the action down, and never throws: a failed write is reported to the
 * server console and the user's action still succeeds. Written with the
 * service-role key, the only key allowed to insert. */
export function logActivity(entry: ActivityEntry): void {
  if (!isSupabaseConfigured()) return;
  after(() => writeActivity(entry));
}

async function writeActivity(entry: ActivityEntry): Promise<void> {
  try {
    const supabase = createServiceClient();
    if (!supabase) return;

    const h = await headers();
    const actor = entry.actor;
    let actorEmail = actor?.email ?? null;
    let actorRole = actor?.role ?? null;
    let targetLabel = entry.target?.label ?? null;

    // Filled in here rather than by the caller, so sign-in doesn't need an
    // extra read before redirecting and admin actions don't wait on it.
    if (actor?.id && (!actorRole || !actorEmail)) {
      const { data } = await supabase.from("profiles").select("email, role").eq("id", actor.id).maybeSingle();
      actorEmail ??= data?.email ?? null;
      actorRole ??= data?.role ?? null;
    }
    if (!targetLabel && entry.target?.type === "user" && entry.target.id) {
      const { data } = await supabase.from("profiles").select("email").eq("id", entry.target.id).maybeSingle();
      targetLabel = data?.email ?? null;
    }

    const { error } = await supabase.from("activity_log").insert({
      actor_id: actor?.id ?? null,
      actor_email: actorEmail,
      actor_role: actorRole,
      action: entry.action,
      target_type: entry.target?.type ?? null,
      target_id: entry.target?.id ?? null,
      target_label: targetLabel,
      details: entry.details ?? {},
      outcome: entry.outcome ?? "success",
      ip: clientIp((name) => h.get(name)),
      user_agent: h.get("user-agent")?.slice(0, 400) ?? null,
    });
    if (error) console.error(`[activity-log] ${entry.action}: ${error.message}`);
  } catch (e) {
    console.error(`[activity-log] ${entry.action}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

type ActivityRow = Database["public"]["Tables"]["activity_log"]["Row"];

function toView(row: ActivityRow): ActivityView {
  return {
    id: row.id,
    createdAt: row.created_at,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    details: row.details ?? {},
    outcome: row.outcome,
    ip: row.ip,
    userAgent: row.user_agent,
  };
}

/** Admin-only read, through the caller's own session — RLS (0027) lets
 * only admins select, same pattern as listLeads(). `limit` overrides the
 * page size for the CSV export. */
export async function listActivity(
  filters: ActivityFilters,
  limit: number = ACTIVITY_PAGE_SIZE
): Promise<{ rows: ActivityView[]; total: number; unavailable: boolean }> {
  const offset = (filters.page - 1) * limit;

  if (!isSupabaseConfigured()) {
    const matched = DEMO_ACTIVITY.filter((r) => matchesFilters(r, filters));
    return { rows: matched.slice(offset, offset + limit), total: matched.length, unavailable: false };
  }

  const supabase = await createClient();
  if (!supabase) return { rows: [], total: 0, unavailable: true };

  let query = supabase
    .from("activity_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.q) query = query.or(`actor_email.ilike.%${filters.q}%,target_label.ilike.%${filters.q}%`);
  if (filters.category) query = query.like("action", `${filters.category}.%`);
  if (filters.outcome) query = query.eq("outcome", filters.outcome);
  const cutoff = sinceCutoff(filters.since);
  if (cutoff) query = query.gte("created_at", cutoff);

  const { data, count, error } = await query;
  if (error || !data) {
    if (error) console.error(`[activity-log] list: ${error.message}`);
    return { rows: [], total: 0, unavailable: true };
  }
  return { rows: data.map(toView), total: count ?? data.length, unavailable: false };
}
