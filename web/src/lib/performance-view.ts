// Pure helpers for /admin/performance — no Supabase or Next imports, so the
// numbers are unit-testable. The statistics mirror src/trade_sim.py's
// summarize() exactly, so a live row and a backtest row mean the same thing.

import type { TradeSource, TradeStatus } from "@/lib/supabase/types";

export const SOURCE_LABELS: Record<TradeSource, string> = {
  confluence: "Confluence engine",
  guda_special: "GUDA SPECIAL",
};

const TIMEFRAME_ORDER = ["5m", "15m", "1h", "4h", "1d"];

export interface TradeOutcomeView {
  id: string;
  source: TradeSource;
  symbol: string;
  timeframe: string;
  strategyVersion: string;
  signalTime: string;
  direction: 1 | -1;
  entry: number;
  stop: number;
  target: number;
  status: TradeStatus;
  bars: number;
  exitPrice: number | null;
  exitTime: string | null;
  rGross: number | null;
  rCost: number;
  rNet: number | null;
}

/** How a backtest's trades turned out for calls scored low–high (out of
 * 100) — backtest_runs.calibration. */
export interface ConfidenceBand {
  low: number;
  high: number;
  trades: number;
  targetRate: number | null;
  winRate: number | null;
  avgRNet: number | null;
}

export interface BacktestRunView {
  id: string;
  createdAt: string;
  strategy: TradeSource;
  strategyVersion: string;
  symbol: string;
  timeframe: string;
  periodStart: string;
  periodEnd: string;
  signals: number;
  skipped: number;
  costPct: number;
  trades: number;
  winRate: number | null;
  avgRNet: number | null;
  avgRGross: number | null;
  avgCostR: number | null;
  totalRNet: number;
  profitFactor: number | null;
  maxDrawdownR: number;
  worstLosingStreak: number;
  targetRate: number | null;
  /** Null on runs saved before migration 0030, and on GUDA SPECIAL's. */
  calibration: ConfidenceBand[] | null;
}

export interface OutcomeStats {
  trades: number;
  open: number;
  winRate: number | null;
  avgRNet: number | null;
  avgRGross: number | null;
  avgCostR: number | null;
  totalRNet: number;
  /** null when there were no losing trades to divide by. */
  profitFactor: number | null;
  maxDrawdownR: number;
  worstLosingStreak: number;
}

export function summarizeOutcomes(rows: TradeOutcomeView[]): OutcomeStats {
  const closed = rows
    .filter((r) => r.status !== "OPEN" && r.rNet !== null && r.exitTime !== null)
    .sort((a, b) => (a.exitTime! < b.exitTime! ? -1 : a.exitTime! > b.exitTime! ? 1 : 0));
  const rs = closed.map((r) => r.rNet!);
  const n = rs.length;

  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  let streak = 0;
  let worst = 0;
  for (const r of rs) {
    equity += r;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
    streak = r <= 0 ? streak + 1 : 0;
    worst = Math.max(worst, streak);
  }

  const gains = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const losses = -rs.filter((r) => r < 0).reduce((a, b) => a + b, 0);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  return {
    trades: n,
    open: rows.filter((r) => r.status === "OPEN").length,
    winRate: n ? rs.filter((r) => r > 0).length / n : null,
    avgRNet: mean(rs),
    avgRGross: mean(closed.map((r) => r.rGross ?? 0)),
    avgCostR: mean(closed.map((r) => r.rCost)),
    totalRNet: rs.reduce((a, b) => a + b, 0),
    profitFactor: losses > 0 ? gains / losses : null,
    maxDrawdownR: drawdown,
    worstLosingStreak: worst,
  };
}

export interface OutcomeGroup {
  source: TradeSource;
  symbol: string;
  timeframe: string;
  strategyVersion: string;
  stats: OutcomeStats;
}

function compareGroups(
  a: { source: string; symbol: string; timeframe: string; strategyVersion?: string },
  b: typeof a
): number {
  return (
    a.source.localeCompare(b.source) ||
    a.symbol.localeCompare(b.symbol) ||
    TIMEFRAME_ORDER.indexOf(a.timeframe) - TIMEFRAME_ORDER.indexOf(b.timeframe) ||
    // Newest engine version first.
    (b.strategyVersion ?? "").localeCompare(a.strategyVersion ?? "", undefined, { numeric: true })
  );
}

/** One row per strategy, market, timeframe and engine version. Versions
 * are kept apart because each is a different set of rules (and, before
 * 3.4.0, different trading costs): an old version's trades say nothing
 * about how the current one is doing. */
export function groupOutcomes(rows: TradeOutcomeView[]): OutcomeGroup[] {
  const groups = new Map<string, TradeOutcomeView[]>();
  for (const row of rows) {
    const key = `${row.source}|${row.symbol}|${row.timeframe}|${row.strategyVersion}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()]
    .map((g) => ({
      source: g[0].source,
      symbol: g[0].symbol,
      timeframe: g[0].timeframe,
      strategyVersion: g[0].strategyVersion,
      stats: summarizeOutcomes(g),
    }))
    .sort(compareGroups);
}

/** The newest run for each strategy, market and timeframe. */
export function latestBacktests(runs: BacktestRunView[]): BacktestRunView[] {
  const latest = new Map<string, BacktestRunView>();
  for (const run of runs) {
    const key = `${run.strategy}|${run.symbol}|${run.timeframe}`;
    const seen = latest.get(key);
    if (!seen || run.createdAt > seen.createdAt) latest.set(key, run);
  }
  return [...latest.values()].sort((a, b) =>
    compareGroups({ source: a.strategy, ...a }, { source: b.strategy, ...b })
  );
}

// --- dashboard live results ---------------------------------------------------------

/** What a user's signal card shows about its own timeframe's live record. */
export interface LiveStat {
  /** Closed trades counted — the most recent ones, up to the limit. */
  trades: number;
  winRate: number | null;
  avgRNet: number | null;
}

/** Below this, a win rate swings too much from one trade to the next to be
 * worth showing as a number. */
export const LIVE_STAT_MIN_TRADES = 10;
export const LIVE_STAT_WINDOW = 30;

/** Keyed by engine version too: a card counts only trades from the
 * version that made its call, not ones an earlier version opened. */
export function liveStatKey(source: TradeSource, symbol: string, timeframe: string, strategyVersion: string): string {
  return `${source}|${symbol}|${timeframe}|${strategyVersion}`;
}

/** The last `limit` closed trades per strategy, market, timeframe and
 * engine version, summed up — the only thing about live results that
 * reaches users. */
export function recentStats(
  rows: Pick<TradeOutcomeView, "source" | "symbol" | "timeframe" | "strategyVersion" | "status" | "rNet" | "exitTime">[],
  limit: number = LIVE_STAT_WINDOW
): Record<string, LiveStat> {
  const closed = rows
    .filter((r) => r.status !== "OPEN" && r.rNet !== null && r.exitTime !== null)
    .sort((a, b) => (a.exitTime! < b.exitTime! ? 1 : a.exitTime! > b.exitTime! ? -1 : 0));

  const byKey = new Map<string, number[]>();
  for (const r of closed) {
    const key = liveStatKey(r.source, r.symbol, r.timeframe, r.strategyVersion);
    const rs = byKey.get(key) ?? [];
    if (rs.length < limit) rs.push(r.rNet!);
    byKey.set(key, rs);
  }

  const stats: Record<string, LiveStat> = {};
  for (const [key, rs] of byKey) {
    stats[key] = {
      trades: rs.length,
      winRate: rs.filter((r) => r > 0).length / rs.length,
      avgRNet: rs.reduce((a, b) => a + b, 0) / rs.length,
    };
  }
  return stats;
}

// --- dashboard backtest odds -------------------------------------------------------

/** What a BUY/SELL card says about how calls on its timeframe did in the
 * backtest. For the whole timeframe, not the call's confidence band: in the
 * Stage 3 backtests the score didn't separate better trades from worse ones
 * (see calibration on /admin/performance), so a per-score figure would
 * suggest a difference that isn't there. */
export interface BacktestOdds {
  trades: number;
  targetRate: number;
  avgRNet: number | null;
}

/** The backtest figures backtestOdds() reads. */
export type BacktestOddsSource = Pick<BacktestRunView, "trades" | "targetRate" | "avgRNet">;

/** Below this, a hit rate is mostly luck. */
export const BACKTEST_ODDS_MIN_TRADES = 30;

export function backtestOddsKey(symbol: string, timeframe: string, strategyVersion: string): string {
  return `${symbol}|${timeframe}|${strategyVersion}`;
}

/** `run` must be a backtest of the same engine version as the call;
 * nothing without one, or with too few trades. */
export function backtestOdds(run: BacktestOddsSource | undefined): BacktestOdds | null {
  if (!run || run.trades < BACKTEST_ODDS_MIN_TRADES || run.targetRate === null) return null;
  return { trades: run.trades, targetRate: run.targetRate, avgRNet: run.avgRNet };
}

/** A timeframe whose backtest clearly made money, not just broke even:
 * enough trades to mean something, and at least this much per trade after
 * costs. At the Stage 3 backtests: Bitcoin 1d, gold 4h and gold 1d — not
 * Bitcoin 4h (+0.07R) or anything shorter. */
export const STRONG_BACKTEST_MIN_AVG_R = 0.2;

/** The figures behind a card's "Strong backtest" badge, or null. */
export function strongBacktest(run: BacktestOddsSource | undefined): BacktestOdds | null {
  const odds = backtestOdds(run);
  return odds && odds.avgRNet !== null && odds.avgRNet >= STRONG_BACKTEST_MIN_AVG_R ? odds : null;
}

// --- formatting -----------------------------------------------------------------

export function formatR(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}R`;
}

/** A cost, always a positive amount taken off — no sign. */
export function formatCostR(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(2)}R`;
}

export function formatPct(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

export function formatRatio(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}

/** Text colour for an R value: green when positive, red when negative. */
export function rTone(v: number | null): string {
  if (v === null || v === 0) return "";
  return v > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}
