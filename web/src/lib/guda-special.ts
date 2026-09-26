import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_GUDA_SPECIAL_SIGNALS } from "@/lib/demo-data";
import type { Database } from "@/lib/supabase/types";

/** GUDA SPECIAL's own signal shape — deliberately not SignalView. The
 * vocabulary doesn't overlap with the confluence engine's cards (BOS,
 * Fibonacci, retracement quality, HTF filter outcome vs. confidence,
 * lifecycle, market phase), so this is a parallel, independent reader —
 * never merged into the `signals`-table array `latestPerPair()` dedupes,
 * and never fed into buildConsensus() (permanent decision: a second
 * strategy isn't "another timeframe's opinion"). */
export interface GudaSpecialSignalView {
  symbol: string;
  timeframe: string;
  generatedAt: string;
  price: number;
  verdict: "BUY" | "SELL" | "NO_TRADE";
  reasoning: string;
  noTradeReason: string | null;
  strategyVersion: string;
  bosKind: "BOS" | "CHoCH";
  bosDirection: 1 | -1;
  bosPrice: number;
  breakStrength: "STRONG" | "NORMAL" | "WEAK" | null;
  impulse: { start: number; end: number; atrMultiple: number } | null;
  fib: { f50: number; f61_8: number; f72: number; f78_6: number } | null;
  retracementQuality: "SHALLOW" | "VALID" | "DEEP" | "FAILED" | null;
  retestConfirmed: boolean | null;
  confirmationPattern: string | null;
  candleQuality: "STRONG" | "NORMAL" | "WEAK" | null;
  htfBias: string | null;
  htfFilterOutcome: "ALIGNED" | "NEUTRAL" | "DOWNGRADED" | "REJECTED" | null;
  levels: { entry: number; stop: number; target: number } | null;
  riskReward: number | null;
  regime: string | null;
}

type GudaSpecialSignalRow = Database["public"]["Tables"]["guda_special_signals"]["Row"];

function toGudaSpecialView(row: GudaSpecialSignalRow): GudaSpecialSignalView {
  const impulse =
    row.impulse_start_price !== null && row.impulse_end_price !== null && row.impulse_atr_multiple !== null
      ? { start: row.impulse_start_price, end: row.impulse_end_price, atrMultiple: row.impulse_atr_multiple }
      : null;

  const fib =
    row.fib_50 !== null && row.fib_61_8 !== null && row.fib_72 !== null && row.fib_78_6 !== null
      ? { f50: row.fib_50, f61_8: row.fib_61_8, f72: row.fib_72, f78_6: row.fib_78_6 }
      : null;

  const levels =
    row.entry !== null && row.stop !== null && row.target !== null
      ? { entry: row.entry, stop: row.stop, target: row.target }
      : null;

  return {
    symbol: row.symbol,
    timeframe: row.timeframe,
    generatedAt: row.generated_at,
    price: row.price,
    verdict: row.verdict,
    reasoning: row.reasoning,
    noTradeReason: row.no_trade_reason,
    strategyVersion: row.strategy_version,
    bosKind: row.bos_kind,
    bosDirection: row.bos_direction,
    bosPrice: row.bos_price,
    breakStrength: row.break_strength,
    impulse,
    fib,
    retracementQuality: row.retracement_quality,
    retestConfirmed: row.retest_confirmed,
    confirmationPattern: row.confirmation_pattern,
    candleQuality: row.candle_quality,
    htfBias: row.htf_bias,
    htfFilterOutcome: row.htf_filter_outcome,
    levels,
    riskReward: row.risk_reward,
    regime: row.regime,
  };
}

/** Latest GUDA SPECIAL signal per (symbol, timeframe, strategy_version) —
 * written correctly from day one, unlike latestPerPair()'s historical
 * 2-column key, since this reader is new. In practice there's at most one
 * "latest" row per symbol today (the strategy only ever runs on 15m). */
function latestPerPair(rows: GudaSpecialSignalRow[]): GudaSpecialSignalView[] {
  const seen = new Set<string>();
  const latest: GudaSpecialSignalView[] = [];
  for (const row of rows) {
    const key = `${row.symbol}:${row.timeframe}:${row.strategy_version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(toGudaSpecialView(row));
  }
  return latest;
}

export async function getLatestGudaSpecialSignals(): Promise<{
  source: "live" | "demo" | "unavailable";
  signals: GudaSpecialSignalView[];
}> {
  if (!isSupabaseConfigured()) return { source: "demo", signals: DEMO_GUDA_SPECIAL_SIGNALS };

  const supabase = await createClient();
  if (!supabase) return { source: "unavailable", signals: [] };

  const { data, error } = await supabase
    .from("guda_special_signals")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(200);

  if (error || !data) return { source: "unavailable", signals: [] };

  return { source: "live", signals: latestPerPair(data) };
}
