// Turns the technical reasoning lines (RSI/MACD/SMA jargon) into one plain
// English sentence anyone can read at a glance. The technical lines
// themselves are never hidden for good — they're always shown too, just
// demoted to secondary detail, so the "why" behind the plain summary is
// still there for anyone who wants it.

export interface SummarizableSignal {
  verdict: "BUY" | "SELL" | "HOLD";
  reasoning: string[];
}

// These keywords are the vocabulary src/signals/engine.py (and the matching
// demo data) already writes into every reasoning line, so counting them is
// a reliable way to tell how many of the 3 indicators agree, without
// depending on the exact wording of any one line.
const BULLISH_WORDS = /bullish|oversold|uptrend/i;
const BEARISH_WORDS = /bearish|overbought|downtrend/i;

export function plainLanguageSummary({ verdict, reasoning }: SummarizableSignal): string {
  const total = reasoning.length || 3;
  const bullish = reasoning.filter((r) => BULLISH_WORDS.test(r)).length;
  const bearish = reasoning.filter((r) => BEARISH_WORDS.test(r)).length;

  if (verdict === "BUY") {
    return bullish >= total
      ? "All signals agree: momentum and trend both point upward."
      : "More signals point up than down — the price may be gaining upward momentum.";
  }

  if (verdict === "SELL") {
    return bearish >= total
      ? "All signals agree: momentum and trend both point downward."
      : "More signals point down than up — the price may be losing ground.";
  }

  // HOLD
  if (bullish === bearish) {
    return "Signals are mixed right now, with no clear direction either way.";
  }
  return bullish > bearish
    ? "Signals lean slightly upward, but not strongly enough to call it a buy yet."
    : "Signals lean slightly downward, but not strongly enough to call it a sell yet.";
}
