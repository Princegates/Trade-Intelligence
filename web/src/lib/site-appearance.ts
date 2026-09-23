import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEFAULT_MODE, DEFAULT_THEME, isMode, isThemeKey, type Mode, type ThemeKey } from "@/lib/themes";

export interface SiteAppearance {
  theme: ThemeKey;
  mode: Mode;
}

/** The one theme/mode the whole site renders in — admin-controlled (see
 * /admin/appearance), not a per-visitor preference. Read server-side and
 * baked directly into the root layout's HTML, so there's no per-visitor
 * guess-then-correct step the way a cookie-based preference would need. */
export async function getSiteAppearance(): Promise<SiteAppearance> {
  if (!isSupabaseConfigured()) return { theme: DEFAULT_THEME, mode: DEFAULT_MODE };

  const supabase = await createClient();
  if (!supabase) return { theme: DEFAULT_THEME, mode: DEFAULT_MODE };

  const { data } = await supabase.from("site_appearance").select("theme, mode").eq("id", true).maybeSingle();

  return {
    theme: isThemeKey(data?.theme) ? data.theme : DEFAULT_THEME,
    mode: isMode(data?.mode) ? data.mode : DEFAULT_MODE,
  };
}
