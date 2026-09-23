import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { CHART_TIMEFRAMES, type Candle } from "@/lib/candle-view";

export { CHART_TIMEFRAMES } from "@/lib/candle-view";
export type { Candle } from "@/lib/candle-view";

/** Closed candles for one series, oldest first.
 *
 * Read from our own mirror rather than the exchange: the chart has to show
 * the same candles the signals were computed on, or the two will eventually
 * disagree and there will be no way to tell which is right. */
export async function getCandles(symbol: string, timeframe: string, limit = 200): Promise<Candle[]> {
  if (!isSupabaseConfigured()) return demoCandles(timeframe, limit);

  const supabase = await createClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("candles")
    .select("open_time, open, high, low, close")
    .eq("symbol", symbol)
    .eq("timeframe", timeframe)
    .order("open_time", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data
    .map((row) => ({
      time: Math.floor(new Date(row.open_time).getTime() / 1000),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
    }))
    .reverse();
}

/** Every timeframe's candles for one symbol, fetched together so switching
 * between them is instant rather than a round-trip. Timeframes with nothing
 * stored are omitted, so the picker only offers what can actually be drawn. */
export async function getCandlesByTimeframe(
  symbol: string,
  timeframes: readonly string[] = CHART_TIMEFRAMES,
  limit = 150,
): Promise<Record<string, Candle[]>> {
  const series = await Promise.all(
    timeframes.map(async (timeframe) => [timeframe, await getCandles(symbol, timeframe, limit)] as const),
  );
  return Object.fromEntries(series.filter(([, candles]) => candles.length > 0));
}

const TIMEFRAME_SECONDS: Record<string, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

/** A plausible-looking series for demo mode, so the chart is not an empty box
 * before Supabase is wired up. Deterministic rather than random, so it does
 * not flicker between renders — and the dashboard labels demo mode already. */
function demoCandles(timeframe: string, limit: number): Candle[] {
  const step = TIMEFRAME_SECONDS[timeframe] ?? 3600;
  const start = Math.floor(Date.now() / 1000 / step) * step - step * limit;

  const out: Candle[] = [];
  let price = 68_000;
  for (let i = 0; i < limit; i++) {
    // A fixed wave plus a slow drift: shaped like a market, invented like one.
    const drift = Math.sin(i / 9) * 260 + Math.sin(i / 3.5) * 90;
    const open = price;
    const close = 68_000 + drift;
    const high = Math.max(open, close) + 60 + Math.abs(Math.sin(i)) * 70;
    const low = Math.min(open, close) - 60 - Math.abs(Math.cos(i)) * 70;
    out.push({ time: start + i * step, open, high, low, close });
    price = close;
  }
  return out;
}
