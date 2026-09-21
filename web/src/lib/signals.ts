import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_SIGNALS, type DemoSignal } from "@/lib/demo-data";
import type { Database } from "@/lib/supabase/types";

export type SignalView = DemoSignal;

type SignalRow = Database["public"]["Tables"]["signals"]["Row"];

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
  };
}

/** Latest signal per (symbol, timeframe). Falls back to demo data when
 * Supabase isn't configured, or when the signals table is still empty
 * (e.g. the Python cron job hasn't been pointed at Supabase yet). */
export async function getLatestSignals(): Promise<SignalView[]> {
  if (!isSupabaseConfigured()) return DEMO_SIGNALS;

  const supabase = await createClient();
  if (!supabase) return DEMO_SIGNALS;

  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(500);

  if (error || !data || data.length === 0) return DEMO_SIGNALS;

  const seen = new Set<string>();
  const latest: SignalView[] = [];
  for (const row of data) {
    const key = `${row.symbol}:${row.timeframe}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(toView(row));
  }
  return latest;
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

export function symbolTimeframePairs(signals: SignalView[]) {
  const map = new Map<string, { symbol: string; timeframe: string }>();
  for (const s of signals) map.set(`${s.symbol}:${s.timeframe}`, { symbol: s.symbol, timeframe: s.timeframe });
  return [...map.values()];
}
