import { describe, expect, it } from "vitest";

import { formatSignalsForChat } from "@/lib/signal-view";
import type { SignalView } from "@/lib/signal-view";

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

function signal(overrides: Partial<SignalView> = {}): SignalView {
  return {
    symbol: "BTCUSDT",
    timeframe: "1h",
    generatedAt: new Date(NOW).toISOString(),
    price: 68420.5,
    verdict: "BUY",
    score: 2,
    reasoning: ["RSI(14) at 58.2 — neutral"],
    confidence: null,
    strategyVersion: "1.0.0",
    patterns: [],
    levels: { entry: 68420.5, stop: 68275.2, target: 68638.4, buyAbove: null, sellBelow: null },
    aiCommentary: null,
    confluenceBias: null,
    regime: null,
    marketPhase: null,
    invalidationLevel: null,
    entryZone: null,
    ...overrides,
  };
}

describe("formatSignalsForChat", () => {
  it("says plainly when there's nothing published yet, rather than an empty string", () => {
    expect(formatSignalsForChat([], NOW)).toBe("No signals have been published yet.");
  });

  it("includes the human asset name, symbol, timeframe, verdict, score, and price", () => {
    const text = formatSignalsForChat([signal()], NOW);
    expect(text).toContain("Bitcoin (BTCUSDT) 1h");
    expect(text).toContain("BUY (score +2)");
    expect(text).toContain("price 68420.5");
  });

  it("formats directional levels as entry/stop/target", () => {
    const text = formatSignalsForChat([signal()], NOW);
    expect(text).toContain("Levels: entry 68420.5, stop 68275.2, target 68638.4.");
  });

  it("formats a HOLD's band levels as buy above / sell below", () => {
    const text = formatSignalsForChat(
      [signal({ verdict: "HOLD", score: 0, levels: { entry: null, stop: null, target: null, buyAbove: 69000, sellBelow: 67500 } })],
      NOW
    );
    expect(text).toContain("Levels: buy above 69000, sell below 67500.");
  });

  it("omits the levels sentence entirely when there are none", () => {
    const text = formatSignalsForChat([signal({ levels: null })], NOW);
    expect(text).not.toContain("Levels:");
  });

  it("includes patterns and reasoning when present", () => {
    const text = formatSignalsForChat([signal({ patterns: ["bullish engulfing"], reasoning: ["a", "b"] })], NOW);
    expect(text).toContain("Patterns: bullish engulfing.");
    expect(text).toContain("Reasoning: a; b.");
  });

  it("flags a stale signal so the assistant doesn't cite it as current", () => {
    const old = signal({ generatedAt: new Date(NOW - 10 * 3600_000).toISOString() }); // 10h old 1h signal
    const text = formatSignalsForChat([old], NOW);
    expect(text).toContain("[STALE, do not treat as current]");
  });

  it("does not flag a fresh signal as stale", () => {
    const text = formatSignalsForChat([signal()], NOW);
    expect(text).not.toContain("STALE");
  });

  it("joins multiple signals one per line", () => {
    const text = formatSignalsForChat([signal({ timeframe: "1h" }), signal({ symbol: "XAUUSD", timeframe: "1h" })], NOW);
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toContain("Gold (XAUUSD)");
  });
});
