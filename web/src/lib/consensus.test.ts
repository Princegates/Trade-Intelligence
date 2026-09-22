import { describe, expect, it } from "vitest";

import { AGREEMENT_THRESHOLD, buildConsensus } from "@/lib/consensus";
import type { SignalView } from "@/lib/signal-view";

const NOW = Date.UTC(2026, 8, 22, 12, 0, 0);

function signal(timeframe: string, verdict: SignalView["verdict"], minutesAgo = 0): SignalView {
  return {
    symbol: "BTCUSDT",
    timeframe,
    generatedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
    price: 86_000,
    verdict,
    score: verdict === "BUY" ? 1 : verdict === "SELL" ? -1 : 0,
    reasoning: [],
    confidence: null,
    strategyVersion: "1.0.0",
    patterns: [],
    levels: { entry: 86_000, stop: 84_000, target: 89_000, buyAbove: null, sellBelow: null },
  };
}

const build = (signals: SignalView[]) => buildConsensus("BTCUSDT", signals, NOW);

describe("direction", () => {
  it("calls a buy when the heavier timeframes agree", () => {
    const c = build([signal("1d", "BUY"), signal("4h", "BUY"), signal("1h", "HOLD")]);
    expect(c.verdict).toBe("BUY");
  });

  it("calls a sell symmetrically", () => {
    const c = build([signal("1d", "SELL"), signal("4h", "SELL"), signal("1h", "HOLD")]);
    expect(c.verdict).toBe("SELL");
  });

  it("refuses to let one timeframe decide alone", () => {
    // The daily is 5 of 15 — below the threshold on its own, by design.
    const c = build([
      signal("1d", "BUY"),
      signal("4h", "HOLD"),
      signal("1h", "HOLD"),
      signal("15m", "HOLD"),
      signal("5m", "HOLD"),
    ]);
    expect(c.verdict).toBe("HOLD");
  });

  it("refuses to let the two lightest timeframes decide", () => {
    // 5m + 15m is 3 of 15: short-term noise must not outvote the rest.
    const c = build([
      signal("1d", "HOLD"),
      signal("4h", "HOLD"),
      signal("1h", "HOLD"),
      signal("15m", "BUY"),
      signal("5m", "BUY"),
    ]);
    expect(c.verdict).toBe("HOLD");
  });

  it("holds when the daily and the 4h point opposite ways", () => {
    const c = build([signal("1d", "BUY"), signal("4h", "SELL"), signal("1h", "HOLD")]);
    expect(c.verdict).toBe("HOLD");
    expect(c.note).toContain("disagree");
  });

  it("lets the heavier side win a genuine split", () => {
    // 1d+4h buy (9) against 15m+5m sell (3) => +6/15 = 0.4
    const c = build([
      signal("1d", "BUY"),
      signal("4h", "BUY"),
      signal("1h", "HOLD"),
      signal("15m", "SELL"),
      signal("5m", "SELL"),
    ]);
    expect(c.verdict).toBe("BUY");
  });
});

describe("staleness", () => {
  it("does not let a stale timeframe vote", () => {
    // A 5m signal 3 hours old is far past its two-interval tolerance.
    const c = build([signal("1d", "BUY"), signal("4h", "BUY"), signal("5m", "SELL", 180)]);
    expect(c.verdict).toBe("BUY");
    expect(c.opinions.find((o) => o.timeframe === "5m")?.counted).toBe(false);
  });

  it("holds when nothing is fresh", () => {
    const c = build([signal("1d", "BUY", 60 * 24 * 5), signal("4h", "BUY", 60 * 24 * 5)]);
    expect(c.verdict).toBe("HOLD");
    expect(c.note).toContain("fresh");
  });

  it("holds on a single fresh timeframe", () => {
    const c = build([signal("1d", "BUY"), signal("5m", "BUY", 180)]);
    expect(c.verdict).toBe("HOLD");
    expect(c.note).toContain("Only 1 timeframe");
  });
});

describe("levels", () => {
  it("takes levels whole from the heaviest agreeing timeframe, never averaged", () => {
    const daily = signal("1d", "BUY");
    daily.levels = { entry: 86_000, stop: 80_000, target: 95_000, buyAbove: null, sellBelow: null };
    const hourly = signal("1h", "BUY");
    hourly.levels = { entry: 86_050, stop: 85_500, target: 87_000, buyAbove: null, sellBelow: null };

    const c = build([daily, hourly, signal("4h", "BUY")]);

    expect(c.source?.timeframe).toBe("1d");
    expect(c.source?.levels?.stop).toBe(80_000);
  });

  it("prefers an agreeing timeframe that actually has levels", () => {
    // A signal published before levels existed is never rewritten, so the
    // heaviest agreeing timeframe can legitimately carry none. Sourcing from
    // it would announce a direction with no entry underneath.
    const daily = signal("1d", "BUY");
    daily.levels = null;
    const fourHour = signal("4h", "BUY");

    const c = build([daily, fourHour, signal("1h", "BUY")]);

    expect(c.verdict).toBe("BUY");
    expect(c.source?.timeframe).toBe("4h");
    expect(c.source?.levels?.entry).not.toBeNull();
  });

  it("still names a source when no agreeing timeframe has levels", () => {
    const daily = signal("1d", "BUY");
    const fourHour = signal("4h", "BUY");
    daily.levels = null;
    fourHour.levels = null;

    const c = build([daily, fourHour]);

    expect(c.verdict).toBe("BUY");
    expect(c.source?.timeframe).toBe("1d");
  });

  it("does not treat a half-populated level set as usable", () => {
    const daily = signal("1d", "BUY");
    daily.levels = { entry: 86_000, stop: null, target: null, buyAbove: null, sellBelow: null };
    const fourHour = signal("4h", "BUY");

    const c = build([daily, fourHour, signal("1h", "BUY")]);

    expect(c.source?.timeframe).toBe("4h");
  });

  it("never sources levels from a timeframe that disagrees", () => {
    const c = build([signal("1d", "SELL"), signal("4h", "SELL"), signal("1h", "BUY")]);
    expect(c.verdict).toBe("SELL");
    expect(c.source?.verdict).toBe("SELL");
  });

  it("ignores a timeframe it has no weight for", () => {
    const c = build([signal("1d", "BUY"), signal("4h", "BUY"), signal("3m", "SELL")]);
    expect(c.verdict).toBe("BUY");
    expect(c.opinions.find((o) => o.timeframe === "3m")?.counted).toBe(false);
  });
});

describe("edges", () => {
  it("survives having no signals at all", () => {
    const c = build([]);
    expect(c.verdict).toBe("HOLD");
    expect(c.source).toBeNull();
  });

  it("only considers the symbol asked for", () => {
    const gold = signal("1d", "SELL");
    gold.symbol = "XAUUSD";
    const c = build([gold, signal("1d", "BUY"), signal("4h", "BUY")]);
    expect(c.verdict).toBe("BUY");
    expect(c.opinions.every((o) => o.timeframe !== undefined)).toBe(true);
  });

  it("reports agreement as a share of counted weight", () => {
    const c = build([signal("1d", "BUY"), signal("4h", "BUY"), signal("1h", "BUY")]);
    expect(c.agreement).toBe(1);
    expect(c.agreement).toBeGreaterThanOrEqual(AGREEMENT_THRESHOLD);
  });
});
