"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SETTINGS_PROVIDERS } from "@/lib/demo-data";
import type { SettingsCategory } from "@/lib/supabase/types";

export interface SettingsFormState {
  error?: string;
  success?: boolean;
}

export async function saveProviderSettings(
  category: SettingsCategory,
  provider: string,
  _prevState: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const admin = await requireAdmin(); // redirects non-admins; defense in depth alongside RLS

  if (!isSupabaseConfigured()) {
    return { error: "Demo mode: Supabase isn't configured, so settings can't be saved." };
  }

  const def = SETTINGS_PROVIDERS[category].find((p) => p.provider === provider);
  if (!def) return { error: "Unknown provider." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { data: existing } = await supabase
    .from("app_settings")
    .select("config")
    .eq("category", category)
    .eq("provider", provider)
    .maybeSingle();

  const config: Record<string, unknown> = { ...((existing?.config as Record<string, unknown>) ?? {}) };

  for (const field of def.fields) {
    const raw = formData.get(field.key);
    if (typeof raw === "string" && raw.trim() !== "") {
      config[field.key] = raw.trim();
    }
    // Blank field: keep whatever was already saved (this is how secret
    // fields stay set without ever being redisplayed to the browser).
  }

  const isActive = formData.get("is_active") === "on";

  const { error } = await supabase.from("app_settings").upsert(
    {
      category,
      provider,
      is_active: isActive,
      config,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "category,provider" }
  );

  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { success: true };
}
