"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { actorOf, logActivity } from "@/lib/activity-log";
import { diffFields } from "@/lib/activity-log-view";
import { isMode, isThemeKey } from "@/lib/themes";

export interface AppearanceFormState {
  error?: string;
  success?: boolean;
}

export async function setSiteAppearance(
  _prevState: AppearanceFormState,
  formData: FormData
): Promise<AppearanceFormState> {
  const admin = await requireAdmin();

  const theme = formData.get("theme");
  const mode = formData.get("mode");
  if (typeof theme !== "string" || typeof mode !== "string" || !isThemeKey(theme) || !isMode(mode)) {
    return { error: "Invalid theme or mode." };
  }

  if (!isSupabaseConfigured()) return { error: "Demo mode: appearance changes aren't saved." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { data: before } = await supabase.from("site_appearance").select("theme, mode").eq("id", true).maybeSingle();

  const { error } = await supabase
    .from("site_appearance")
    .update({ theme, mode, updated_by: admin.id, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) return { error: error.message };

  logActivity({
    action: "admin.appearance_changed",
    actor: actorOf(admin),
    target: { type: "setting", label: "Site appearance" },
    details: { changes: diffFields({ Theme: before?.theme, Mode: before?.mode }, { Theme: theme, Mode: mode }) },
  });

  // The whole site reads this value, not just /admin/appearance.
  revalidatePath("/", "layout");
  return { success: true };
}
