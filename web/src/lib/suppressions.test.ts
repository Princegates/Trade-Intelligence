import { describe, expect, it } from "vitest";

import { unresolvedSuppressions } from "@/lib/signal-view";
import type { SignalView, SuppressionView } from "@/lib/signal-view";

const T = (minutes: number) => new Date(Date.UTC(2026, 8, 22, 12, minutes)).toISOString();

function suppression(timeframe: string, minutes: number): SuppressionView {
  return { symbol: "XAUUSD", timeframe, observedAt: T(minutes), reason: "NO_DATA", detail: "" };
}

function signal(timeframe: string, minutes: number, symbol = "XAUUSD"): SignalView {
  return {
    symbol,
    timeframe,
    generatedAt: T(minutes),
    price: 2400,
    verdict: "HOLD",
    score: 0,
    reasoning: [],
    confidence: null,
    strategyVersion: "1.0.0",
    patterns: [],
    levels: null,
  };
}

describe("unresolvedSuppressions", () => {
  it("drops a suppression once a signal arrives for that series", () => {
    // The feed recovered — saying "no signal" next to a signal is just wrong.
    const left = unresolvedSuppressions([suppression("1h", 10)], [signal("1h", 20)]);
    expect(left).toEqual([]);
  });

  it("keeps one that is still the latest word", () => {
    const left = unresolvedSuppressions([suppression("1h", 30)], [signal("1h", 20)]);
    expect(left).toHaveLength(1);
  });

  it("keeps one for a series with no signal at all", () => {
    const left = unresolvedSuppressions([suppression("1h", 10)], []);
    expect(left).toHaveLength(1);
  });

  it("matches on timeframe, not just symbol", () => {
    // A 1h signal says nothing about whether 4h is still broken.
    const left = unresolvedSuppressions([suppression("4h", 10)], [signal("1h", 20)]);
    expect(left).toHaveLength(1);
  });

  it("matches on symbol, not just timeframe", () => {
    const left = unresolvedSuppressions([suppression("1h", 10)], [signal("1h", 20, "BTCUSDT")]);
    expect(left).toHaveLength(1);
  });

  it("treats a simultaneous signal as having resolved it", () => {
    const left = unresolvedSuppressions([suppression("1h", 20)], [signal("1h", 20)]);
    expect(left).toEqual([]);
  });

  it("handles no suppressions at all", () => {
    expect(unresolvedSuppressions([], [signal("1h", 20)])).toEqual([]);
  });
});
