import { describe, expect, it } from "vitest";
import { lotOutcome } from "./position-size";

describe("lotOutcome", () => {
  it("prices a gold trade: 0.01 lots is 1 oz", () => {
    // A $5 stop and $15 target on 0.02 lots (2 oz), on a $1,000 account.
    const o = lotOutcome({ lots: 0.02, entry: 4100, stop: 4095, target: 4115, lotSize: 100, balance: 1000 })!;
    expect(o.units).toBeCloseTo(2);
    expect(o.loss).toBeCloseTo(10);
    expect(o.gain).toBeCloseTo(30);
    expect(o.lossPct).toBeCloseTo(1);
    expect(o.gainPct).toBeCloseTo(3);
  });

  it("prices a Bitcoin sell: 0.01 lots is 0.01 BTC", () => {
    // Stop $1,710 above the entry: 0.01 BTC loses $17.10, 21% of an $80 account.
    const o = lotOutcome({ lots: 0.01, entry: 84290, stop: 86000, target: 79160, lotSize: 1, balance: 80 })!;
    expect(o.loss).toBeCloseTo(17.1);
    expect(o.gain).toBeCloseTo(51.3);
    expect(o.lossPct).toBeCloseTo(21.375);
  });

  it("gives money without percentages when there's no balance or target", () => {
    const o = lotOutcome({ lots: 0.1, entry: 100, stop: 90, target: null, lotSize: 1, balance: null })!;
    expect(o.loss).toBeCloseTo(1);
    expect(o.gain).toBeNull();
    expect(o.lossPct).toBeNull();
  });

  it("refuses nonsense", () => {
    expect(lotOutcome({ lots: 0, entry: 100, stop: 90, target: null, lotSize: 1, balance: 100 })).toBeNull();
    expect(lotOutcome({ lots: 0.01, entry: 100, stop: 100, target: null, lotSize: 1, balance: 100 })).toBeNull();
  });
});
