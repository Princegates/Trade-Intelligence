import { describe, expect, it } from "vitest";

import { AGREEMENT_THRESHOLD, breakoutPlans, buildConsensus } from "@/lib/consensus";
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
    aiCommentary: null,
    confluenceBias: null,
    regime: null,
    marketPhase: null,
    invalidationLevel: null,
    entryZone: null,
    lifecycle: null,
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

describe("breakout plans", () => {
  function holding(buyAbove: number, sellBelow: number, price = 86_000) {
    const s = signal("1h", "HOLD");
    s.price = price;
    s.levels = { entry: null, stop: null, target: null, buyAbove, sellBelow };
    return s;
  }

  it("turns a band into a buy and a sell plan", () => {
    const plans = breakoutPlans(holding(87_000, 85_000));
    expect(plans.map((p) => p.direction)).toEqual(["BUY", "SELL"]);
  });

  it("puts the stop back where the band was drawn", () => {
    // A breakout that returns to where it started has failed.
    const plans = breakoutPlans(holding(87_000, 85_000));
    expect(plans[0].stop).toBe(86_000);
    expect(plans[1].stop).toBe(86_000);
  });

  it("targets 1.5x the risk, matching the engine's sizing", () => {
    const [buy, sell] = breakoutPlans(holding(87_000, 85_000)); // risk 1000
    expect(buy.target).toBe(87_000 + 1_500);
    expect(sell.target).toBe(85_000 - 1_500);
  });

  it("keeps the plans the right way round", () => {
    const [buy, sell] = breakoutPlans(holding(87_000, 85_000));
    expect(buy.stop).toBeLessThan(buy.trigger);
    expect(buy.target).toBeGreaterThan(buy.trigger);
    expect(sell.stop).toBeGreaterThan(sell.trigger);
    expect(sell.target).toBeLessThan(sell.trigger);
  });

  it("a HOLD sources from a timeframe with a band, not one with a trade", () => {
    // The daily called SELL, so it carries entry/stop/target and no band —
    // it cannot say where the wait ends. Picking it because it "has levels"
    // leaves the tile with nothing to show.
    const daily = signal("1d", "SELL");
    const hourly = signal("1h", "BUY");
    const fourHour = signal("4h", "HOLD");
    fourHour.levels = { entry: null, stop: null, target: null, buyAbove: 87_000, sellBelow: 85_000 };

    const c = build([daily, fourHour, hourly]);

    expect(c.verdict).toBe("HOLD");
    expect(c.source?.timeframe).toBe("4h");
    expect(breakoutPlans(c.source!)).toHaveLength(2);
  });

  it("produces nothing without a band", () => {
    const s = signal("1h", "HOLD");
    s.levels = null;
    expect(breakoutPlans(s)).toEqual([]);
  });

  it("produces nothing from a degenerate band", () => {
    expect(breakoutPlans(holding(86_000, 86_000))).toEqual([]);
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
