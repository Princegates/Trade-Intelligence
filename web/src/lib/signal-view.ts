// The shape of a signal as the UI sees it, plus the pure helpers that read
// it. Deliberately free of `server-only` and of any data access: the
// consensus maths and the staleness rule are ordinary functions, and keeping
// them behind a server-only import made them untestable.

import type { SuppressionReason, Verdict } from "@/lib/supabase/types";

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
