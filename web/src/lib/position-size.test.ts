import { describe, expect, it } from "vitest";
import { positionSize } from "./position-size";

describe("positionSize", () => {
  it("sizes a gold position to lose the chosen share at the stop", () => {
    // $1,000 at 1% = $10; a $5 stop -> 2 oz = 0.02 lots of 100 oz.
    const p = positionSize({ balance: 1000, riskPct: 1, entry: 4100, stop: 4095, target: 4115, lotSize: 100 })!;
    expect(p.riskAmount).toBe(10);
    expect(p.units).toBe(2);
    expect(p.lots).toBeCloseTo(0.02);
    expect(p.lotsRisk).toBeCloseTo(10);
    expect(p.lotsReward).toBeCloseTo(30);
  });

  it("rounds lots down so the risk never exceeds the plan", () => {
    // $50 over a $1,500 BTC stop = 0.0333 BTC -> 0.03 lots, risking $45.
    const p = positionSize({ balance: 5000, riskPct: 1, entry: 84000, stop: 82500, target: null, lotSize: 1 })!;
    expect(p.lots).toBeCloseTo(0.03);
    expect(p.lotsRisk).toBeCloseTo(45);
    expect(p.lotsReward).toBeNull();
  });

  it("reports zero lots, and what the smallest lot would risk, when the account is too small", () => {
    const p = positionSize({ balance: 100, riskPct: 1, entry: 84000, stop: 82500, target: null, lotSize: 1 })!;
    expect(p.lots).toBe(0);
    expect(p.minLotRisk).toBeCloseTo(15);
  });

  it("works for sells and refuses nonsense", () => {
    expect(positionSize({ balance: 1000, riskPct: 2, entry: 100, stop: 110, target: 70, lotSize: 1 })!.units).toBe(2);
    expect(positionSize({ balance: 0, riskPct: 1, entry: 100, stop: 90, target: null, lotSize: 1 })).toBeNull();
    expect(positionSize({ balance: 1000, riskPct: 1, entry: 100, stop: 100, target: null, lotSize: 1 })).toBeNull();
  });
});
