import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_SETTINGS, SETTINGS_PROVIDERS } from "@/lib/demo-data";
import type { SettingsCategory } from "@/lib/supabase/types";

export interface ProviderState {
  isActive: boolean;
  /** Prefill values for non-secret fields. Secret fields are always "" —
   * saved secret values are never sent to the client. */
  values: Record<string, string>;
  /** Per secret field: whether a value is already saved (renders a "saved,
   * leave blank to keep" placeholder instead of the value itself). */
  hasSecret: Record<string, boolean>;
}

export async function getProviderState(category: SettingsCategory, provider: string): Promise<ProviderState> {
  const def = SETTINGS_PROVIDERS[category].find((p) => p.provider === provider);
  const fields = def?.fields ?? [];

  let isActive = false;
  let rawConfig: Record<string, unknown> = {};

  if (!isSupabaseConfigured()) {
    const demo = DEMO_SETTINGS.find((s) => s.category === category && s.provider === provider);
    isActive = demo?.isActive ?? false;
    rawConfig = demo?.config ?? {};
  } else {
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase
        .from("app_settings")
        .select("is_active, config")
        .eq("category", category)
        .eq("provider", provider)
        .maybeSingle();
      isActive = data?.is_active ?? false;
      rawConfig = (data?.config as Record<string, unknown>) ?? {};
    }
  }

  const values: Record<string, string> = {};
  const hasSecret: Record<string, boolean> = {};
  for (const field of fields) {
    const raw = rawConfig[field.key];
    const str = typeof raw === "string" ? raw : "";
    if (field.secret) {
      hasSecret[field.key] = str.length > 0;
      values[field.key] = "";
    } else {
      values[field.key] = str;
    }
  }
  return { isActive, values, hasSecret };
}

export async function getAllProviderStates(category: SettingsCategory) {
  const providers = SETTINGS_PROVIDERS[category];
  const states = await Promise.all(providers.map((p) => getProviderState(category, p.provider)));
  return providers.map((def, i) => ({ def, state: states[i] }));
}
