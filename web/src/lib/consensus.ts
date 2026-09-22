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

/** Reward aimed for per unit risked. Matches REWARD_TO_RISK in the engine. */
const REWARD_TO_RISK = 1.5;

export interface BreakoutPlan {
  direction: "BUY" | "SELL";
  trigger: number;
  stop: number;
  target: number;
}

/** What a HOLD turns into if price leaves the band, with its stop and target.
 *
 * "Buy above X" on its own still leaves the two questions that matter
 * unanswered: where is it wrong, and where do you take profit. None of this
 * is invented — the engine sizes a HOLD band as price plus or minus one stop
 * distance, so that distance is recoverable from the band itself, and the
 * same reward-to-risk the engine applies to a directional call carries
 * forward. The stop sits back at the price the band was drawn around: if a
 * breakout returns there, it failed. */
export function breakoutPlans(signal: SignalView): BreakoutPlan[] {
  const l = signal.levels;
  if (!l || l.buyAbove == null || l.sellBelow == null) return [];

  const risk = l.buyAbove - signal.price;
  if (!(risk > 0)) return [];

  return [
    {
      direction: "BUY",
      trigger: l.buyAbove,
      stop: signal.price,
      target: l.buyAbove + risk * REWARD_TO_RISK,
    },
    {
      direction: "SELL",
      trigger: l.sellBelow,
      stop: signal.price,
      target: l.sellBelow - risk * REWARD_TO_RISK,
    },
  ];
}

function byWeightDescending(a: SignalView, b: SignalView) {
  return (TIMEFRAME_WEIGHTS[b.timeframe] ?? 0) - (TIMEFRAME_WEIGHTS[a.timeframe] ?? 0);
}

/** Carries an entry and a stop — what a directional call needs. */
function hasTradeLevels(signal: SignalView) {
  const l = signal.levels;
  return l != null && l.entry != null && l.stop != null;
}

/** Carries the band a HOLD is waiting out.
 *
 * Distinct from hasTradeLevels on purpose: a timeframe that called SELL
 * carries an entry and a stop but no band, so it cannot tell a HOLD where
 * the wait ends. Treating "has some levels" as good enough picks that
 * timeframe and leaves the tile with nothing to show. */
function hasBand(signal: SignalView) {
  const l = signal.levels;
  return l != null && l.buyAbove != null && l.sellBelow != null;
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

  const hold = (note: string): Consensus => {
    // Same preference as the directional path: the heaviest timeframe may be
    // an older signal with no levels, and sourcing from it would leave a HOLD
    // with no band — no answer to "so when do I act?".
    const ranked = [...counted].sort(byWeightDescending);
    return {
      symbol,
      verdict: "HOLD",
      agreement: 0,
      opinions,
      source: ranked.find(hasBand) ?? ranked[0] ?? null,
      note,
    };
  };

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
  //
  // Preferring one that *has* levels matters during a rollout: a signal
  // published before levels existed is never rewritten, so the heaviest
  // agreeing timeframe can be an older one carrying none — and the tile would
  // announce a direction with no entry under it. Falling back to the heaviest
  // agreeing timeframe keeps the verdict honest when none of them have levels.
  const agreeingSignals = counted.filter((s) => s.verdict === verdict).sort(byWeightDescending);
  const source = agreeingSignals.find(hasTradeLevels) ?? agreeingSignals[0] ?? null;

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
