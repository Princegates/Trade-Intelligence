import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_BACKTEST_RUNS, DEMO_TRADE_OUTCOMES } from "@/lib/demo-data";
import type { BacktestRunView, ConfidenceBand, TradeOutcomeView } from "@/lib/performance-view";
import type { ConfidenceBandRow, Database } from "@/lib/supabase/types";

type OutcomeRow = Database["public"]["Tables"]["trade_outcomes"]["Row"];
type BacktestRow = Database["public"]["Tables"]["backtest_runs"]["Row"];

function toOutcome(r: OutcomeRow): TradeOutcomeView {
  return {
    id: r.id,
    source: r.source,
    symbol: r.symbol,
    timeframe: r.timeframe,
    signalTime: r.signal_time,
    direction: r.direction,
    entry: r.entry,
    stop: r.stop,
    target: r.target,
    status: r.status,
    bars: r.bars,
    exitPrice: r.exit_price,
    exitTime: r.exit_time,
    rGross: r.r_gross,
    rCost: r.r_cost,
    rNet: r.r_net,
  };
}

function toBacktest(r: BacktestRow): BacktestRunView {
  return {
    id: r.id,
    createdAt: r.created_at,
    strategy: r.strategy,
    strategyVersion: r.strategy_version,
    symbol: r.symbol,
    timeframe: r.timeframe,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    signals: r.signals,
    skipped: r.skipped,
    costPct: r.cost_pct,
    trades: r.trades,
    winRate: r.win_rate,
    avgRNet: r.avg_r_net,
    avgRGross: r.avg_r_gross,
    avgCostR: r.avg_cost_r,
    totalRNet: r.total_r_net,
    profitFactor: r.profit_factor,
    maxDrawdownR: r.max_drawdown_r,
    worstLosingStreak: r.worst_losing_streak,
    targetRate: r.target_rate,
    calibration: toBands(r.calibration),
  };
}

export function toBands(rows: ConfidenceBandRow[] | null): ConfidenceBand[] | null {
  return rows
    ? rows.map((b) => ({
        low: b.low,
        high: b.high,
        trades: b.trades,
        targetRate: b.target_rate,
        winRate: b.win_rate,
        avgRNet: b.avg_r_net,
      }))
    : null;
}

/** Tracked trades and backtest runs for /admin/performance. Admin-only
 * through RLS (0028_trade_outcomes.sql), read with the caller's own
 * session like the other admin pages. `unavailable` means the tables
 * couldn't be read — most likely migration 0028 hasn't been run. */
export async function getPerformance(): Promise<{
  outcomes: TradeOutcomeView[];
  backtests: BacktestRunView[];
  unavailable: boolean;
}> {
  if (!isSupabaseConfigured()) {
    return { outcomes: DEMO_TRADE_OUTCOMES, backtests: DEMO_BACKTEST_RUNS, unavailable: false };
  }

  const supabase = await createClient();
  if (!supabase) return { outcomes: [], backtests: [], unavailable: true };

  const [outcomes, backtests] = await Promise.all([
    supabase.from("trade_outcomes").select("*").order("signal_time", { ascending: false }).limit(5000),
    supabase.from("backtest_runs").select("*").order("created_at", { ascending: false }).limit(200),
  ]);

  if (outcomes.error || backtests.error) {
    console.error(`[performance] ${(outcomes.error ?? backtests.error)?.message}`);
    return { outcomes: [], backtests: [], unavailable: true };
  }

  return {
    outcomes: (outcomes.data ?? []).map(toOutcome),
    backtests: (backtests.data ?? []).map(toBacktest),
    unavailable: false,
  };
}
