import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_TRADE_OUTCOMES } from "@/lib/demo-data";
import { recentStats, type LiveStat } from "@/lib/performance-view";

/** Whether signal cards show their timeframe's live results — the admin
 * switch from 0029_live_results_toggle.sql. Same fallbacks as
 * getGudaSpecialSettings(): shown in demo mode (to showcase the product),
 * hidden when a configured project fails to answer. */
export async function getLiveResultsSettings(): Promise<{ enabled: boolean }> {
  if (!isSupabaseConfigured()) return { enabled: true };

  const supabase = await createClient();
  if (!supabase) return { enabled: false };

  const { data } = await supabase.from("live_results_settings").select("enabled").eq("id", true).maybeSingle();
  return { enabled: data?.enabled ?? false };
}

// Read with the service-role key because trade_outcomes is admin-only
// (0028) and every user's dashboard needs the numbers — but only the
// summaries computed here ever leave the server, never the trade rows.
// Cached across users: results only change when a trade closes.
const getCachedStats = unstable_cache(
  async (): Promise<Record<string, LiveStat>> => {
    const supabase = createServiceClient();
    if (!supabase) return {};
    const { data, error } = await supabase
      .from("trade_outcomes")
      .select("source, symbol, timeframe, status, r_net, exit_time")
      .neq("status", "OPEN")
      .order("exit_time", { ascending: false })
      .limit(5000);
    if (error || !data) return {};
    return recentStats(
      data.map((r) => ({
        source: r.source,
        symbol: r.symbol,
        timeframe: r.timeframe,
        status: r.status,
        rNet: r.r_net,
        exitTime: r.exit_time,
      }))
    );
  },
  ["live-stats"],
  { revalidate: 300, tags: ["live-stats"] }
);

/** The last 30 closed trades' results for every strategy, market and
 * timeframe, keyed by liveStatKey(). */
export async function getLiveStats(): Promise<Record<string, LiveStat>> {
  if (!isSupabaseConfigured()) return recentStats(DEMO_TRADE_OUTCOMES);
  return getCachedStats();
}
