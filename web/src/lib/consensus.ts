import { isStale, type SignalView } from "@/lib/signal-view";
import type { Verdict } from "@/lib/supabase/types";

/** How much each timeframe's opinion counts.
 *
 * A daily candle reflects far more participation than a 5-minute one, so it
 * carries more weight. Weighting them equally would let two minutes of noise
 * outvote a week of trend. */
export const TIMEFRAME_WEIGHTS: Record<string, number> = {
  "1d": 5,
  "4h": 4,
  "1h": 3,
  "15m": 2,
  "5m": 1,
};

/** Share of the voting weight that must back one direction before the tile
 * calls it. Set so a single timeframe cannot decide on its own — the daily
 * alone is 5 of 15 — but the daily plus the 4h can. */
export const AGREEMENT_THRESHOLD = 0.35;

/** Fewest fresh timeframes worth combining. One opinion is not a consensus. */
export const MIN_TIMEFRAMES = 2;

export interface TimeframeOpinion {
  timeframe: string;
  verdict: Verdict;
  weight: number;
  counted: boolean;
}

export interface Consensus {
  symbol: string;
  verdict: Verdict;
  /** Share of counted weight backing the verdict, 0..1. */
  agreement: number;
  opinions: TimeframeOpinion[];
  /** The signal the levels are taken from — never an average of several. */
  source: SignalView | null;
  /** Why the answer is HOLD when it is, in plain words. */
  note: string;
}

const direction = (v: Verdict) => (v === "BUY" ? 1 : v === "SELL" ? -1 : 0);

function byWeightDescending(a: SignalView, b: SignalView) {
  return (TIMEFRAME_WEIGHTS[b.timeframe] ?? 0) - (TIMEFRAME_WEIGHTS[a.timeframe] ?? 0);
}

/** Combine one symbol's timeframes into a single call.
 *
 * Stale timeframes are dropped rather than counted: a signal too old to show
 * on its own card is too old to vote here. */
export function buildConsensus(symbol: string, signals: SignalView[], now: number = Date.now()): Consensus {
  const mine = signals.filter((s) => s.symbol === symbol);

  const opinions: TimeframeOpinion[] = mine
    .map((s) => ({
      timeframe: s.timeframe,
      verdict: s.verdict,
      weight: TIMEFRAME_WEIGHTS[s.timeframe] ?? 0,
      counted: !isStale(s, now) && (TIMEFRAME_WEIGHTS[s.timeframe] ?? 0) > 0,
    }))
    .sort((a, b) => b.weight - a.weight);

  const counted = mine.filter((s) => !isStale(s, now) && (TIMEFRAME_WEIGHTS[s.timeframe] ?? 0) > 0);
  const totalWeight = counted.reduce((sum, s) => sum + TIMEFRAME_WEIGHTS[s.timeframe], 0);

  const hold = (note: string): Consensus => ({
    symbol,
    verdict: "HOLD",
    agreement: 0,
    opinions,
    source: [...counted].sort(byWeightDescending)[0] ?? null,
    note,
  });

  if (counted.length < MIN_TIMEFRAMES || totalWeight === 0) {
    return hold(
      counted.length === 0
        ? "No timeframe is currently fresh enough to read."
        : `Only ${counted.length} timeframe is fresh — not enough to agree on anything.`,
    );
  }

  const weighted = counted.reduce((sum, s) => sum + TIMEFRAME_WEIGHTS[s.timeframe] * direction(s.verdict), 0);
  const ratio = weighted / totalWeight;

  if (Math.abs(ratio) < AGREEMENT_THRESHOLD) {
    const bulls = counted.filter((s) => s.verdict === "BUY").length;
    const bears = counted.filter((s) => s.verdict === "SELL").length;
    return hold(
      bulls > 0 && bears > 0
        ? `Timeframes disagree — ${bulls} pointing up, ${bears} down. Waiting is the position.`
        : "No timeframe is leaning far enough to act on.",
    );
  }

  const verdict: Verdict = ratio > 0 ? "BUY" : "SELL";

  // Levels are lifted from the heaviest timeframe that actually agrees, whole.
  // Averaging levels across timeframes would produce an entry and stop that
  // describe no real setup.
  const source = counted.filter((s) => s.verdict === verdict).sort(byWeightDescending)[0] ?? null;

  const agreeing = counted.filter((s) => s.verdict === verdict).map((s) => s.timeframe);

  return {
    symbol,
    verdict,
    agreement: Math.abs(ratio),
    opinions,
    source,
    note: `${agreeing.join(", ")} agree${agreeing.length === 1 ? "s" : ""} on ${verdict.toLowerCase()}${
      source ? `; levels from the ${source.timeframe} setup` : ""
    }.`,
  };
}
