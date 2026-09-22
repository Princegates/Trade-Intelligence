import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_SIGNALS } from "@/lib/demo-data";
import type { Database, SuppressionReason, Verdict } from "@/lib/supabase/types";

export interface SignalView {
  symbol: string;
  timeframe: string;
  generatedAt: string;
  price: number;
  verdict: Verdict;
  score: number;
  reasoning: string[];
  confidence: number | null;
  strategyVersion: string;
  patterns: string[];
  /** Where to act, sized from volatility. A directional call carries entry,
   * stop and target; a HOLD carries the two prices that would end the wait.
   * Null when the engine had no ATR to size them from. */
  levels: {
    entry: number | null;
    stop: number | null;
    target: number | null;
    buyAbove: number | null;
    sellBelow: number | null;
  } | null;
}

export interface SuppressionView {
  symbol: string;
  timeframe: string;
  observedAt: string;
  reason: SuppressionReason;
  detail: string;
}

/** Where the numbers on screen came from.
 *
 * `demo` is sample data shown before a Supabase project is wired up, and
 * `unavailable` means the live feed could not be read. Neither is ever
 * silently presented as a live price — the UI labels both (BR-002, BR-006). */
export type FeedSource = "live" | "demo" | "unavailable";

export interface SignalFeed {
  source: FeedSource;
  signals: SignalView[];
}

const TIMEFRAME_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
};

type SignalRow = Database["public"]["Tables"]["signals"]["Row"];
type SuppressionRow = Database["public"]["Tables"]["signal_suppressions"]["Row"];

function toView(row: SignalRow): SignalView {
  return {
    symbol: row.symbol,
    timeframe: row.timeframe,
    generatedAt: row.generated_at,
    price: row.price,
    verdict: row.verdict,
    score: row.score,
    reasoning: row.reasoning
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean),
    confidence: row.confidence,
    strategyVersion: row.strategy_version,
    patterns: (row.patterns ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    levels:
      row.entry === null && row.buy_above === null
        ? null
        : {
            entry: row.entry,
            stop: row.stop,
            target: row.target,
            buyAbove: row.buy_above,
            sellBelow: row.sell_below,
          },
  };
}

/** A signal whose run is older than two of its own intervals means the cron
 * has stopped producing. Shown as stale rather than passed off as current. */
export function isStale(signal: SignalView, now: number = Date.now()): boolean {
  const interval = TIMEFRAME_SECONDS[signal.timeframe];
  if (!interval) return false;
  return (now - new Date(signal.generatedAt).getTime()) / 1000 > interval * 2;
}

function latestPerPair(rows: SignalRow[]): SignalView[] {
  const seen = new Set<string>();
  const latest: SignalView[] = [];
  for (const row of rows) {
    const key = `${row.symbol}:${row.timeframe}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(toView(row));
  }
  return latest;
}

/** Latest signal per (symbol, timeframe). */
export async function getLatestSignals(): Promise<SignalFeed> {
  if (!isSupabaseConfigured()) return { source: "demo", signals: DEMO_SIGNALS };

  const supabase = await createClient();
  if (!supabase) return { source: "unavailable", signals: [] };

  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(500);

  if (error || !data) return { source: "unavailable", signals: [] };

  // An empty table is a live feed that has not published yet, not a reason to
  // fall back to sample prices.
  return { source: "live", signals: latestPerPair(data) };
}

export async function getSignalHistory(symbol: string, timeframe: string, limit = 25): Promise<SignalView[]> {
  if (!isSupabaseConfigured()) {
    return DEMO_SIGNALS.filter((s) => s.symbol === symbol && s.timeframe === timeframe);
  }

  const supabase = await createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .eq("symbol", symbol)
    .eq("timeframe", timeframe)
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(toView);
}

/** Most recent reason per (symbol, timeframe) the engine withheld a signal,
 * so an absent signal can be explained rather than just missing. */
export async function getRecentSuppressions(withinHours = 24): Promise<SuppressionView[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  if (!supabase) return [];

  const since = new Date(Date.now() - withinHours * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("signal_suppressions")
    .select("*")
    .gte("observed_at", since)
    .order("observed_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];

  const seen = new Set<string>();
  const latest: SuppressionView[] = [];
  for (const row of data as SuppressionRow[]) {
    const key = `${row.symbol}:${row.timeframe}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push({
      symbol: row.symbol,
      timeframe: row.timeframe,
      observedAt: row.observed_at,
      reason: row.reason,
      detail: row.detail,
    });
  }
  return latest;
}

export function symbolTimeframePairs(signals: SignalView[]) {
  const map = new Map<string, { symbol: string; timeframe: string }>();
  for (const s of signals) map.set(`${s.symbol}:${s.timeframe}`, { symbol: s.symbol, timeframe: s.timeframe });
  return [...map.values()];
}
