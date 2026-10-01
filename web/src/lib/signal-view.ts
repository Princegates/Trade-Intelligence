// The shape of a signal as the UI sees it, plus the pure helpers that read
// it. Deliberately free of `server-only` and of any data access: the
// consensus maths and the staleness rule are ordinary functions, and keeping
// them behind a server-only import made them untestable.

import type { LifecycleState, SuppressionReason, Verdict } from "@/lib/supabase/types";

/** LOW/NORMAL/HIGH/EXTREME — current ATR against a longer-run baseline.
 * Shared by both strategies (see src/signals/volatility_regime.py). Market
 * context, never itself a verdict. */
export type VolatilityRegime = "LOW" | "NORMAL" | "HIGH" | "EXTREME";

/** Where price sits within a reference swing leg, in five bands. Shared by
 * both strategies (src/signals/price_range.py). Per the engine's own
 * contract, never interpreted as a buy/sell signal on its own — context,
 * same as regime/marketPhase below. */
export type RangeZone = "DEEP_DISCOUNT" | "DISCOUNT" | "EQUILIBRIUM" | "PREMIUM" | "DEEP_PREMIUM";

/** The same eight confidence categories the reasoning text already states
 * in prose (see src/signals/engine.py::_confidence), as a structured shape
 * instead — kept snake_case to match the jsonb column verbatim rather than
 * adding a translation layer for an internal, not-yet-rendered-distinctly
 * shape (the numbers are already visible in `reasoning`). */
export interface ConfidenceBreakdown {
  total: number;
  trend: { score: number; max: number };
  structure: { score: number; max: number };
  pullback: { score: number; max: number };
  support_resistance: { score: number; max: number };
  candle: { score: number; max: number };
  volatility: { score: number; max: number };
  momentum: { score: number; max: number };
  liquidity: { score: number; max: number };
}

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
  /** An LLM-written paragraph adding color to the same call the deterministic
   * plain-language summary already states — additive, never the source of
   * the verdict itself. Null when no admin-configured AI provider has
   * generated one (or generation failed) for this signal; see
   * src/lib/plain-language.ts for the always-available fallback. */
  aiCommentary: string | null;
  /** Higher-timeframe structural bias ("up"/"down"/"range") the engine
   * checked this call against, or null when no anchor-timeframe data was
   * available at signal time. Not currently rendered anywhere on its own —
   * an opposing bias already shows up as a HOLD with the reason spelled
   * out in `reasoning` — stored for queryability. See
   * src/signals/confluence.py. */
  confluenceBias: string | null;
  /** TRENDING/RANGING/REVERSING — what the market is doing, independent of
   * whether this call survived to publish. Populated even on a HOLD (see
   * src/signals/structure.py::regime()). */
  regime: string | null;
  /** IMPULSE/PULLBACK/CONSOLIDATION/BREAKOUT/REVERSAL — same "populated
   * even on HOLD" contract as regime. See
   * src/signals/entry_zone.py::market_phase(). */
  marketPhase: string | null;
  /** The raw structural level whose breach means this call's thesis was
   * wrong — distinct from `levels.stop`, which adds a noise buffer. Null on
   * HOLD or when no structural level was available yet (src/signals/
   * entry_zone.py::invalidation_level()). */
  invalidationLevel: number | null;
  /** The preferred-entry band around the nearest structural level. Null on
   * HOLD or when unavailable, same contract as invalidationLevel (see
   * src/signals/entry_zone.py::entry_zone()). */
  entryZone: { low: number; high: number } | null;
  /** How this signal's entry thesis is progressing since publication —
   * re-evaluated on every scheduled run (src/run.py::recheck_lifecycles()),
   * unlike every other field here which is fixed at generation time. Null
   * for HOLD and ATR-fallback calls, which never get a lifecycle row at
   * all (src/signals/lifecycle.py::tracks()). See src/signals/
   * lifecycle.py for what each state means. */
  lifecycle: { state: LifecycleState; enteredAt: string } | null;
  /** Core Market Intelligence context (src/signals/volatility_regime.py) —
   * populated even on HOLD, same "describes the market" contract as regime/
   * marketPhase above. Null without enough candle history for the
   * longer-run ATR baseline. */
  volatilityRegime: VolatilityRegime | null;
  /** Fibonacci retracement levels of the most recently confirmed swing leg
   * (src/signals/fibonacci.py, shared with GUDA SPECIAL) — informational
   * only, never an automatic entry signal. Null without a confirmed swing
   * leg to measure from. Named `fib` (not `fibonacci`) to match
   * GudaSpecialSignalView's own field shape. */
  fib: { direction: 1 | -1; f50: number; f61_8: number; f72: number; f78_6: number } | null;
  /** Premium/discount position over that same swing leg (src/signals/
   * price_range.py). Null alongside `fib` — same leg, same availability. */
  priceRange: { positionPct: number; zone: RangeZone } | null;
  /** Structured version of the confidence breakdown reasoning already
   * states in prose — see ConfidenceBreakdown above. Null on HOLD, same
   * contract as confidence itself. */
  confidenceBreakdown: ConfidenceBreakdown | null;
}

export interface SuppressionView {
  symbol: string;
  timeframe: string;
  observedAt: string;
  reason: SuppressionReason;
  detail: string;
}

export const TIMEFRAME_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
};

/** Human names for the tickers, so the dashboard reads "Bitcoin" and "Gold"
 * rather than raw symbols — the symbol is still shown alongside it, never
 * hidden, since that's what the signal is actually keyed on. Mirrors
 * src/config.py's INSTRUMENTS order (Bitcoin, then gold). */
export const ASSET_NAMES: Record<string, string> = {
  BTCUSDT: "Bitcoin",
  XAUUSD: "Gold",
};

export const ASSET_ORDER = ["BTCUSDT", "XAUUSD"];

/** Timeframes whose calls are there for scalp traders. Backtested on BTC at
 * Exness costs they lost about 0.2R a trade on average, where 1h, 4h and
 * 1d were profitable (see CALL_TIMEFRAMES in src/config.py), so their
 * cards carry a warning rather than being withdrawn. */
export const SCALP_TIMEFRAMES = ["5m", "15m"];

export const SCALP_WARNING =
  "For scalp traders. In testing, 5m and 15m calls lost slightly on average after costs, unlike the 1h, 4h and daily calls. Consider smaller size.";

/** A signal whose run is older than two of its own intervals means the cron
 * has stopped producing. Shown as stale rather than passed off as current. */
export function isStale(signal: SignalView, now: number = Date.now()): boolean {
  const interval = TIMEFRAME_SECONDS[signal.timeframe];
  if (!interval) return false;
  return (now - new Date(signal.generatedAt).getTime()) / 1000 > interval * 2;
}

/** Suppressions that still explain something.
 *
 * A suppression is only news while it is the latest word on that series. Once
 * a signal arrives for the same instrument and timeframe, the feed recovered
 * and saying "no signal because the provider returned nothing" is simply
 * wrong — there is a signal, right there on the page. */
export function unresolvedSuppressions(
  suppressions: SuppressionView[],
  signals: SignalView[],
): SuppressionView[] {
  const newestSignal = new Map<string, number>();
  for (const s of signals) {
    const key = `${s.symbol}:${s.timeframe}`;
    const at = new Date(s.generatedAt).getTime();
    newestSignal.set(key, Math.max(newestSignal.get(key) ?? 0, at));
  }

  return suppressions.filter((suppression) => {
    const signalAt = newestSignal.get(`${suppression.symbol}:${suppression.timeframe}`);
    if (signalAt === undefined) return true;
    return new Date(suppression.observedAt).getTime() > signalAt;
  });
}

/** Every current signal, as plain text — fed into the chat assistant's
 * prompt (see src/lib/actions/chat.ts) so it can answer from what's
 * actually on the dashboard right now instead of generic market talk. A
 * stale signal is still included but flagged, the same distinction the
 * dashboard itself shows, so the assistant doesn't cite an expired call as
 * if it were current. */
export function formatSignalsForChat(signals: SignalView[], now: number = Date.now()): string {
  if (signals.length === 0) return "No signals have been published yet.";

  return signals
    .map((s) => {
      const stale = isStale(s, now);
      const levels = s.levels
        ? s.levels.entry !== null
          ? ` Levels: entry ${s.levels.entry}, stop ${s.levels.stop}, target ${s.levels.target}.`
          : ` Levels: buy above ${s.levels.buyAbove}, sell below ${s.levels.sellBelow}.`
        : "";
      const patterns = s.patterns.length > 0 ? ` Patterns: ${s.patterns.join(", ")}.` : "";
      const reasoning = s.reasoning.length > 0 ? ` Reasoning: ${s.reasoning.join("; ")}.` : "";

      return (
        `${ASSET_NAMES[s.symbol] ?? s.symbol} (${s.symbol}) ${s.timeframe}${stale ? " [STALE, do not treat as current]" : ""} — ` +
        `${s.verdict} (score ${s.score > 0 ? "+" : ""}${s.score}), price ${s.price}, as of ${s.generatedAt}.` +
        `${levels}${patterns}${reasoning}`
      );
    })
    .join("\n");
}
