import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_BACKTEST_RUNS, DEMO_TRADE_OUTCOMES } from "@/lib/demo-data";
import {
  backtestOddsKey,
  recentStats,
  type BacktestOddsSource as OddsSource,
  type BacktestRunView,
  type LiveStat,
} from "@/lib/performance-view";

/** The admin switches for what signal cards show about results:
 * `enabled` is each timeframe's live record (0029), `showBacktestOdds` how
 * similar calls did in the backtest (0030). Same fallbacks as
 * getGudaSpecialSettings(): shown in demo mode (to showcase the product),
 * hidden when a configured project fails to answer. */
export async function getLiveResultsSettings(): Promise<{ enabled: boolean; showBacktestOdds: boolean }> {
  if (!isSupabaseConfigured()) return { enabled: true, showBacktestOdds: true };

  const supabase = await createClient();
  if (!supabase) return { enabled: false, showBacktestOdds: false };

  // "*" so this still reads the live-results switch before 0030 adds the other column.
  const { data } = await supabase.from("live_results_settings").select("*").eq("id", true).maybeSingle();
  return { enabled: data?.enabled ?? false, showBacktestOdds: data?.show_backtest_odds ?? false };
}

/** The newest confluence backtest per market, timeframe and engine
 * version, keyed by backtestOddsKey(). */
function latestOddsSources(
  runs: (OddsSource & Pick<BacktestRunView, "strategy" | "strategyVersion" | "symbol" | "timeframe" | "createdAt">)[]
): Record<string, OddsSource> {
  const latest = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    if (run.strategy !== "confluence") continue;
    const key = backtestOddsKey(run.symbol, run.timeframe, run.strategyVersion);
    const seen = latest.get(key);
    if (!seen || run.createdAt > seen.createdAt) latest.set(key, run);
  }
  return Object.fromEntries(
    [...latest].map(([key, r]) => [
      key,
      { trades: r.trades, targetRate: r.targetRate, avgRNet: r.avgRNet },
    ])
  );
}

// Service role for the same reason as the live stats below: backtest_runs
// is admin-only, and only these summaries reach users.
const getCachedOddsSources = unstable_cache(
  async (): Promise<Record<string, OddsSource>> => {
    const supabase = createServiceClient();
    if (!supabase) return {};
    const { data, error } = await supabase
      .from("backtest_runs")
      .select("strategy, strategy_version, symbol, timeframe, created_at, trades, target_rate, avg_r_net")
      .eq("strategy", "confluence")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !data) return {};
    return latestOddsSources(
      data.map((r) => ({
        strategy: r.strategy,
        strategyVersion: r.strategy_version,
        symbol: r.symbol,
        timeframe: r.timeframe,
        createdAt: r.created_at,
        trades: r.trades,
        targetRate: r.target_rate,
        avgRNet: r.avg_r_net,
      }))
    );
  },
  ["backtest-odds"],
  { revalidate: 3600, tags: ["backtest-odds"] }
);

/** Backtest figures for the dashboard's odds line, keyed by
 * backtestOddsKey(); pass one to backtestOdds(). */
export async function getBacktestOddsSources(): Promise<Record<string, OddsSource>> {
  if (!isSupabaseConfigured()) return latestOddsSources(DEMO_BACKTEST_RUNS);
  return getCachedOddsSources();
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
