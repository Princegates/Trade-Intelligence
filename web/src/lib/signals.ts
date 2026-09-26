import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_SIGNALS } from "@/lib/demo-data";
import type { Database } from "@/lib/supabase/types";
import type { SignalView, SuppressionView } from "@/lib/signal-view";

export { isStale, TIMEFRAME_SECONDS, ASSET_NAMES, ASSET_ORDER, unresolvedSuppressions } from "@/lib/signal-view";
export type { SignalView, SuppressionView } from "@/lib/signal-view";

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

type SignalRow = Database["public"]["Tables"]["signals"]["Row"];
type SuppressionRow = Database["public"]["Tables"]["signal_suppressions"]["Row"];
type CommentaryRow = Database["public"]["Tables"]["signal_commentary"]["Row"];

function toView(row: SignalRow, aiCommentary: string | null = null): SignalView {
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
    levels: toLevels(row),
    aiCommentary,
    confluenceBias: row.confluence_bias ?? null,
  };
}

/** Levels are only usable as a complete set, and a database that predates
 * migration 0005 returns `undefined` for these columns rather than null — so
 * normalise both away here rather than letting a half-populated object reach
 * the UI, where a missing number renders as a crash. */
function toLevels(row: SignalRow): SignalView["levels"] {
  const entry = row.entry ?? null;
  const stop = row.stop ?? null;
  const target = row.target ?? null;
  const buyAbove = row.buy_above ?? null;
  const sellBelow = row.sell_below ?? null;

  const directional = entry !== null && stop !== null && target !== null;
  const band = buyAbove !== null && sellBelow !== null;
  if (!directional && !band) return null;

  return { entry, stop, target, buyAbove, sellBelow };
}

function latestPerPair(rows: SignalRow[], commentary: Map<string, string>): SignalView[] {
  const seen = new Set<string>();
  const latest: SignalView[] = [];
  for (const row of rows) {
    const key = `${row.symbol}:${row.timeframe}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(toView(row, commentary.get(key) ?? null));
  }
  return latest;
}

/** Latest AI commentary per (symbol, timeframe), keyed the same way
 * latestPerPair dedups signals — matches by recency rather than an exact
 * join to the signal's own identity, since commentary is written right
 * after its signal and the two are for all practical purposes always in
 * step. A stale pairing (commentary lagging a newer signal by a beat) is a
 * low-stakes, self-correcting edge case: the always-current deterministic
 * summary sits right above it either way. */
async function getLatestCommentary(): Promise<Map<string, string>> {
  const supabase = await createClient();
  if (!supabase) return new Map();

  const { data } = await supabase
    .from("signal_commentary")
    .select("symbol, timeframe, commentary, generated_at")
    .order("generated_at", { ascending: false })
    .limit(200);

  const map = new Map<string, string>();
  for (const row of (data as Pick<CommentaryRow, "symbol" | "timeframe" | "commentary">[] | null) ?? []) {
    const key = `${row.symbol}:${row.timeframe}`;
    if (!map.has(key)) map.set(key, row.commentary);
  }
  return map;
}

/** Latest signal per (symbol, timeframe). */
export async function getLatestSignals(): Promise<SignalFeed> {
  if (!isSupabaseConfigured()) return { source: "demo", signals: DEMO_SIGNALS };

  const supabase = await createClient();
  if (!supabase) return { source: "unavailable", signals: [] };

  const [{ data, error }, commentary] = await Promise.all([
    supabase.from("signals").select("*").order("generated_at", { ascending: false }).limit(500),
    getLatestCommentary(),
  ]);

  if (error || !data) return { source: "unavailable", signals: [] };

  // An empty table is a live feed that has not published yet, not a reason to
  // fall back to sample prices.
  return { source: "live", signals: latestPerPair(data, commentary) };
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
  return data.map((row) => toView(row));
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
