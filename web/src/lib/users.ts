import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_USERS, type DemoUser } from "@/lib/demo-data";

export type UserRow = DemoUser;

export async function listUsers(): Promise<UserRow[]> {
  if (!isSupabaseConfigured()) return DEMO_USERS;

  const supabase = await createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, email: r.email, fullName: r.full_name, role: r.role, createdAt: r.created_at }));
}
