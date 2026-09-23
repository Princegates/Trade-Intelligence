"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Role } from "@/lib/supabase/types";

export async function setUserRole(userId: string, role: Role) {
  await requireAdmin();

  if (!isSupabaseConfigured()) return { error: "Demo mode: role changes aren't persisted." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}

export async function setUserApproval(userId: string, approved: boolean) {
  await requireAdmin();

  if (!isSupabaseConfigured()) return { error: "Demo mode: approval changes aren't persisted." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { error } = await supabase.from("profiles").update({ approved }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}
