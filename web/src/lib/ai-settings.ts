import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface AiProvider {
  provider: string;
  config: Record<string, string>;
}

/** The admin's active AI provider (see /admin/settings), for any signed-in
 * user's request to use — not just an admin's. app_settings itself is
 * admin-only RLS (see 0001_init.sql), so this reads it through the
 * service_role client rather than the per-request one that's bound to the
 * caller's own session. */
export async function getActiveAiProvider(): Promise<AiProvider | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("app_settings")
    .select("provider, config")
    .eq("category", "ai")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { provider: data.provider, config: (data.config as Record<string, string>) ?? {} };
}
