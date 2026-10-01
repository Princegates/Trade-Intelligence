import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_SIGNALS } from "@/lib/demo-data";
import type { Database } from "@/lib/supabase/types";
import type { SignalView, SuppressionView } from "@/lib/signal-view";

type Client = SupabaseClient<Database>;

// The dashboard's own auth gate (src/lib/auth.ts#requireUser, enforced by
// every route that ends up calling the functions below) already restricts
// this whole feed to approved users and admins — exactly what `has_access()`
// re-checks at the row level for signal_suppressions, candles and
// economic_events (see migration 0009). So for the read-only queries in this
// file and in calendar.ts/candles.ts, that RLS check is redundant with the
// page-level gate, not a second independent boundary — which is what makes
// it safe to read through the service-role client below instead of the
// per-request cookie client: unstable_cache can't see cookies() at all
// ("Accessing uncached data sources such as headers or cookies inside a
// cache scope is not supported"), so a shared, cross-user cache needs a
// client that doesn't need the request's session to read this data.
// Everyone who reaches this data already cleared the same gate the RLS
// policy is enforcing, so nothing new becomes readable.
const CACHE_SECONDS = 30;

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
type LifecycleRow = Database["public"]["Tables"]["signal_lifecycle"]["Row"];

function toView(row: SignalRow, aiCommentary: string | null = null, lifecycle: SignalView["lifecycle"] = null): SignalView {
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
    regime: row.regime ?? null,
    marketPhase: row.market_phase ?? null,
    invalidationLevel: row.invalidation_level ?? null,
    entryZone: toEntryZone(row),
    lifecycle,
    volatilityRegime: (row.volatility_regime as SignalView["volatilityRegime"]) ?? null,
    fib: toFib(row),
    priceRange: toPriceRange(row),
    confidenceBreakdown: (row.confidence_breakdown as SignalView["confidenceBreakdown"]) ?? null,
  };
}

/** Same "only usable as a complete set" reasoning as toLevels()/toEntryZone()
 * above — fib_direction/fib_50/etc. are either all populated together (a
 * confirmed swing leg was available) or all null (none was). */
function toFib(row: SignalRow): SignalView["fib"] {
  const direction = row.fib_direction ?? null;
  const f50 = row.fib_50 ?? null;
  const f61_8 = row.fib_61_8 ?? null;
  const f72 = row.fib_72 ?? null;
  const f78_6 = row.fib_78_6 ?? null;
  if (direction === null || f50 === null || f61_8 === null || f72 === null || f78_6 === null) return null;
  return { direction, f50, f61_8, f72, f78_6 };
}

function toPriceRange(row: SignalRow): SignalView["priceRange"] {
  const positionPct = row.range_position_pct ?? null;
  const zone = row.range_zone ?? null;
  if (positionPct === null || zone === null) return null;
  return { positionPct, zone: zone as NonNullable<SignalView["priceRange"]>["zone"] };
}

/** Same "only usable as a complete set" reasoning as toLevels() above — a
 * database that predates migration 0016 returns `undefined` for these
 * columns rather than null, and a half-populated band is worse than no
 * band. */
function toEntryZone(row: SignalRow): SignalView["entryZone"] {
  const low = row.entry_zone_low ?? null;
  const high = row.entry_zone_high ?? null;
  if (low === null || high === null) return null;
  return { low, high };
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

function latestPerPair(
  rows: SignalRow[],
  commentary: Map<string, string>,
  lifecycle: Map<string, SignalView["lifecycle"]>
): SignalView[] {
  const seen = new Set<string>();
  const latest: SignalView[] = [];
  for (const row of rows) {
    // symbol:timeframe only, deliberately NOT including strategy_version:
    // `signals` has genuinely carried several STRATEGY_VERSION values over
    // this project's life (2.0.0 through 3.1.0), and rows are still
    // immutable/append-only — several of those old versions' rows can sit
    // inside the same 500-row fetch window as the current one. Keying on
    // strategy_version here surfaced every one of them as its own separate
    // card for the same timeframe (visibly, e.g. three "15m" cards) instead
    // of collapsing to the single most-recent row, which is what a "latest
    // signal per pair" reader is supposed to do. The scenario this was
    // trying to guard against — a second strategy's row colliding on this
    // key — can't happen in the first place: GUDA SPECIAL writes only to
    // guda_special_signals, never to this table (see guda-special.ts).
    const key = `${row.symbol}:${row.timeframe}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const identityKey = `${row.symbol}:${row.timeframe}:${row.candle_time}:${row.strategy_version}`;
    latest.push(toView(row, commentary.get(key) ?? null, lifecycle.get(identityKey) ?? null));
  }
  return latest;
}

/** Latest AI commentary per (symbol, timeframe), keyed the same way
 * latestPerPair dedups signals — matches by recency rather than an exact
 * join to the signal's own identity, since commentary is written right
 * after its signal and the two are for all practical purposes always in
 * step. A stale pairing (commentary lagging a newer signal by a beat) is a
 * low-stakes, self-correcting edge case: the always-current deterministic
 * summary sits right above it either way. Deliberately not keyed on
 * strategy_version — same reasoning as latestPerPair() above: this table
 * only ever holds the confluence engine's own commentary (GUDA SPECIAL has
 * no commentary yet), and several of the confluence engine's own past
 * STRATEGY_VERSION values can legitimately coexist within the fetch
 * window, where only the single most recent should win. */
async function getLatestCommentary(supabase: Client): Promise<Map<string, string>> {
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

/** Lifecycle state per signal, keyed by the FULL 4-column identity tuple
 * (symbol, timeframe, candle_time, strategy_version) — unlike
 * getLatestCommentary()'s deliberately lossy 2-column (symbol, timeframe)
 * recency match, this has to join to one specific signal exactly: a
 * signal's own lifecycle status is not something "whichever is most
 * recent" can stand in for. */
async function getLatestLifecycle(supabase: Client): Promise<Map<string, SignalView["lifecycle"]>> {
  const { data } = await supabase
    .from("signal_lifecycle")
    .select("symbol, timeframe, candle_time, strategy_version, state, entered_at");

  const map = new Map<string, SignalView["lifecycle"]>();
  for (const row of (data as Pick<
    LifecycleRow,
    "symbol" | "timeframe" | "candle_time" | "strategy_version" | "state" | "entered_at"
  >[] | null) ?? []) {
    const key = `${row.symbol}:${row.timeframe}:${row.candle_time}:${row.strategy_version}`;
    map.set(key, { state: row.state, enteredAt: row.entered_at });
  }
  return map;
}

async function readLatestSignals(supabase: Client): Promise<SignalFeed> {
  const [{ data, error }, commentary, lifecycle] = await Promise.all([
    supabase.from("signals").select("*").order("generated_at", { ascending: false }).limit(500),
    getLatestCommentary(supabase),
    getLatestLifecycle(supabase),
  ]);

  if (error || !data) return { source: "unavailable", signals: [] };

  // An empty table is a live feed that has not published yet, not a reason to
  // fall back to sample prices.
  return { source: "live", signals: latestPerPair(data, commentary, lifecycle) };
}

// 500 signal rows plus the commentary and lifecycle joins, on every one of
// however many concurrent page loads hit the dashboard at once — cached so
// one read serves all of them until the next window, since the result is
// the same for every viewer (see the comment above CACHE_SECONDS).
const getCachedLatestSignals = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    if (!supabase) return { source: "unavailable", signals: [] } satisfies SignalFeed;
    return readLatestSignals(supabase);
  },
  ["latest-signals"],
  { revalidate: CACHE_SECONDS, tags: ["signals"] }
);

/** Latest signal per (symbol, timeframe). */
export async function getLatestSignals(): Promise<SignalFeed> {
  if (!isSupabaseConfigured()) return { source: "demo", signals: DEMO_SIGNALS };

  // Falls back to an uncached, per-request read when no service-role key is
  // configured (e.g. a local checkout without one) — correctness first, the
  // cache is a bonus once that key exists.
  if (createServiceClient()) return getCachedLatestSignals();

  const supabase = await createClient();
  if (!supabase) return { source: "unavailable", signals: [] };
  return readLatestSignals(supabase);
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

async function readRecentSuppressions(supabase: Client, withinHours: number): Promise<SuppressionView[]> {
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

const getCachedRecentSuppressions = unstable_cache(
  async (withinHours: number) => {
    const supabase = createServiceClient();
    if (!supabase) return [];
    return readRecentSuppressions(supabase, withinHours);
  },
  ["recent-suppressions"],
  { revalidate: CACHE_SECONDS, tags: ["suppressions"] }
);

/** Most recent reason per (symbol, timeframe) the engine withheld a signal,
 * so an absent signal can be explained rather than just missing. */
export async function getRecentSuppressions(withinHours = 24): Promise<SuppressionView[]> {
  if (!isSupabaseConfigured()) return [];

  if (createServiceClient()) return getCachedRecentSuppressions(withinHours);

  const supabase = await createClient();
  if (!supabase) return [];
  return readRecentSuppressions(supabase, withinHours);
}

export function symbolTimeframePairs(signals: SignalView[]) {
  const map = new Map<string, { symbol: string; timeframe: string }>();
  for (const s of signals) map.set(`${s.symbol}:${s.timeframe}`, { symbol: s.symbol, timeframe: s.timeframe });
  return [...map.values()];
}
