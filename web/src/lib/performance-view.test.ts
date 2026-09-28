import { describe, expect, it } from "vitest";
import {
  formatR,
  groupOutcomes,
  latestBacktests,
  summarizeOutcomes,
  type BacktestRunView,
  type TradeOutcomeView,
} from "./performance-view";

let seq = 0;
const trade = (overrides: Partial<TradeOutcomeView> = {}): TradeOutcomeView => ({
  id: String(++seq),
  source: "confluence",
  symbol: "BTCUSDT",
  timeframe: "1h",
  signalTime: "2026-09-01T00:00:00Z",
  direction: 1,
  entry: 100,
  stop: 98,
  target: 104,
  status: "TARGET",
  bars: 5,
  exitPrice: 104,
  exitTime: "2026-09-01T05:00:00Z",
  rGross: 2,
  rCost: 0.1,
  rNet: 1.9,
  ...overrides,
});

describe("summarizeOutcomes", () => {
  it("matches the engine's summary figures", () => {
    const s = summarizeOutcomes([
      trade({ rNet: 2, rGross: 2, exitTime: "2026-09-01T01:00:00Z" }),
      trade({ status: "STOP", rNet: -1, rGross: -1, exitTime: "2026-09-01T02:00:00Z" }),
      trade({ status: "STOP", rNet: -1, rGross: -1, exitTime: "2026-09-01T03:00:00Z" }),
      trade({ rNet: 2, rGross: 2, exitTime: "2026-09-01T04:00:00Z" }),
      trade({ status: "OPEN", rNet: null, rGross: null, exitTime: null }),
    ]);
    expect(s.trades).toBe(4);
    expect(s.open).toBe(1);
    expect(s.winRate).toBe(0.5);
    expect(s.avgRNet).toBe(0.5);
    expect(s.totalRNet).toBe(2);
    expect(s.profitFactor).toBe(2);
    expect(s.maxDrawdownR).toBe(2);
    expect(s.worstLosingStreak).toBe(2);
  });

  it("orders by exit time before measuring drawdown", () => {
    const s = summarizeOutcomes([
      trade({ status: "STOP", rNet: -1, exitTime: "2026-09-01T03:00:00Z" }),
      trade({ rNet: 2, exitTime: "2026-09-01T01:00:00Z" }),
      trade({ status: "STOP", rNet: -1, exitTime: "2026-09-01T02:00:00Z" }),
    ]);
    expect(s.maxDrawdownR).toBe(2);
    expect(s.worstLosingStreak).toBe(2);
  });

  it("handles nothing closed yet", () => {
    const s = summarizeOutcomes([trade({ status: "OPEN", rNet: null, exitTime: null })]);
    expect(s.trades).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.profitFactor).toBeNull();
  });
});

describe("groupOutcomes", () => {
  it("keeps strategies, markets and timeframes apart, shortest timeframe first", () => {
    const groups = groupOutcomes([
      trade({ timeframe: "4h" }),
      trade({ timeframe: "15m" }),
      trade({ source: "guda_special", timeframe: "15m" }),
      trade({ timeframe: "15m" }),
    ]);
    expect(groups.map((g) => `${g.source} ${g.timeframe} ${g.stats.trades}`)).toEqual([
      "confluence 15m 2",
      "confluence 4h 1",
      "guda_special 15m 1",
    ]);
  });
});

describe("latestBacktests", () => {
  const run = (overrides: Partial<BacktestRunView>): BacktestRunView => ({
    id: String(++seq),
    createdAt: "2026-09-01T00:00:00Z",
    strategy: "confluence",
    symbol: "BTCUSDT",
    timeframe: "1h",
    periodStart: "2024-09-01T00:00:00Z",
    periodEnd: "2026-09-01T00:00:00Z",
    signals: 10,
    skipped: 2,
    costPct: 0.24,
    trades: 8,
    winRate: 0.5,
    avgRNet: 0.1,
    avgRGross: 0.3,
    avgCostR: 0.2,
    totalRNet: 0.8,
    profitFactor: 1.2,
    maxDrawdownR: 3,
    worstLosingStreak: 3,
    ...overrides,
  });

  it("keeps only the newest run per strategy, market and timeframe", () => {
    const latest = latestBacktests([
      run({ id: "old", createdAt: "2026-09-01T00:00:00Z" }),
      run({ id: "new", createdAt: "2026-09-20T00:00:00Z" }),
      run({ id: "4h", timeframe: "4h" }),
    ]);
    expect(latest.map((r) => r.id)).toEqual(["new", "4h"]);
  });
});

describe("formatR", () => {
  it("signs values and marks missing ones", () => {
    expect(formatR(0.456)).toBe("+0.46R");
    expect(formatR(-1)).toBe("−1.00R");
    expect(formatR(0)).toBe("0.00R");
    expect(formatR(null)).toBe("—");
  });
});
