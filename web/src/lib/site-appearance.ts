import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEFAULT_MODE, DEFAULT_THEME, isMode, isThemeKey, type Mode, type ThemeKey } from "@/lib/themes";

export interface SiteAppearance {
  /** The one color theme the whole site renders in — admin-controlled (see
   * /admin/appearance), not a per-visitor preference. No visitor can
   * override this. */
  theme: ThemeKey;
  /** The *default* day/night mode for a visitor who hasn't picked their own
   * yet. Unlike theme, this is only a starting point — ModeToggle lets any
   * visitor set their own mode (a cookie), which always wins over this. */
  mode: Mode;
}

/** Read server-side and baked directly into the root layout's HTML for
 * `theme` (no per-visitor guess-then-correct step needed, since the server
 * already knows the one true value). `mode` still goes through that
 * flash-prevention dance client-side — see components/mode/. */
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
