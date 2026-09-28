"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { actorOf, logActivity } from "@/lib/activity-log";

export async function setGudaSpecialEnabled(enabled: boolean) {
  const admin = await requireAdmin();

  if (!isSupabaseConfigured()) return { error: "Demo mode: this setting isn't persisted." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { error } = await supabase.from("guda_special_settings").update({ enabled }).eq("id", true);
  if (error) return { error: error.message };

  logActivity({
    action: "admin.guda_special_toggled",
    actor: actorOf(admin),
    target: { type: "setting", label: "GUDA SPECIAL" },
    details: { visible_to_users: enabled },
  });

  revalidatePath("/admin/settings");
  return { success: true };
}
