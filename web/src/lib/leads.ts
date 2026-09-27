import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { LeadKind } from "@/lib/supabase/types";

export interface LeadRow {
  id: string;
  kind: LeadKind;
  email: string;
  name: string | null;
  note: string | null;
  createdAt: string;
  handled: boolean;
}

/** Admin-only (see migration 0026's "leads: admins read" policy) — called
 * from /admin/leads with the caller's own session, not the service-role
 * client, since RLS already grants an admin's own session read access. */
export async function listLeads(): Promise<LeadRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  if (!supabase) return [];

  const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    kind: row.kind,
    email: row.email,
    name: row.name,
    note: row.note,
    createdAt: row.created_at,
    handled: row.handled,
  }));
}
