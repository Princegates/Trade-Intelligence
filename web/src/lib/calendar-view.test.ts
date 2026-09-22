import { describe, expect, it } from "vitest";

import { affectedInstruments, isSameUtcDay, isWithinWindow, sortByTime, type CalendarEvent } from "@/lib/calendar-view";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    title: "CPI m/m",
    country: "USD",
    eventTime: "2026-09-25T16:30:00.000Z",
    impact: "High",
    forecast: "0.3%",
    previous: "0.2%",
    actual: null,
    ...overrides,
  };
}

describe("affectedInstruments", () => {
  it("holds gold for a high-impact USD event", () => {
    const affected = affectedInstruments(event());
    expect(affected).toEqual([
      { symbol: "XAUUSD", holdFrom: "2026-09-25T16:00:00.000Z", holdUntil: "2026-09-25T17:30:00.000Z" },
    ]);
  });

  it("does not hold anything for a medium-impact event", () => {
    expect(affectedInstruments(event({ impact: "Medium" }))).toEqual([]);
  });

  it("does not hold anything for a low-impact event", () => {
    expect(affectedInstruments(event({ impact: "Low" }))).toEqual([]);
  });

  it("is case-insensitive about impact", () => {
    expect(affectedInstruments(event({ impact: "HIGH" }))).toHaveLength(1);
  });

  it("does not hold anything for a currency with no mapped instrument", () => {
    expect(affectedInstruments(event({ country: "EUR" }))).toEqual([]);
  });

  it("never holds BTC — EVENT_RISK_CURRENCY has no entry for it", () => {
    const affected = affectedInstruments(event());
    expect(affected.some((a) => a.symbol === "BTCUSDT")).toBe(false);
  });
});

describe("isWithinWindow", () => {
  const e = event(); // 2026-09-25T16:30:00Z, window 16:00–17:30

  it("is true right at the event time", () => {
    expect(isWithinWindow(e, new Date("2026-09-25T16:30:00.000Z").getTime())).toBe(true);
  });

  it("is true at the edge of the before-window", () => {
    expect(isWithinWindow(e, new Date("2026-09-25T16:00:00.000Z").getTime())).toBe(true);
  });

  it("is true at the edge of the after-window", () => {
    expect(isWithinWindow(e, new Date("2026-09-25T17:30:00.000Z").getTime())).toBe(true);
  });

  it("is false well before the window", () => {
    expect(isWithinWindow(e, new Date("2026-09-25T14:00:00.000Z").getTime())).toBe(false);
  });

  it("is false well after the window", () => {
    expect(isWithinWindow(e, new Date("2026-09-25T20:00:00.000Z").getTime())).toBe(false);
  });

  it("is false for an event that never gates anything", () => {
    expect(isWithinWindow(event({ impact: "Low" }), new Date("2026-09-25T16:30:00.000Z").getTime())).toBe(false);
  });
});

describe("sortByTime", () => {
  it("orders events oldest first", () => {
    const later = event({ title: "Later", eventTime: "2026-09-26T00:00:00.000Z" });
    const earlier = event({ title: "Earlier", eventTime: "2026-09-24T00:00:00.000Z" });

    expect(sortByTime([later, earlier]).map((e) => e.title)).toEqual(["Earlier", "Later"]);
  });

  it("does not mutate the input array", () => {
    const input = [event({ eventTime: "2026-09-26T00:00:00.000Z" }), event({ eventTime: "2026-09-24T00:00:00.000Z" })];
    const original = [...input];

    sortByTime(input);

    expect(input).toEqual(original);
  });
});

describe("isSameUtcDay", () => {
  const NOW = new Date("2026-09-25T18:00:00.000Z").getTime();

  it("is true for an event earlier the same UTC day", () => {
    expect(isSameUtcDay("2026-09-25T00:05:00.000Z", NOW)).toBe(true);
  });

  it("is true for an event later the same UTC day", () => {
    expect(isSameUtcDay("2026-09-25T23:55:00.000Z", NOW)).toBe(true);
  });

  it("is false just after midnight UTC the next day", () => {
    expect(isSameUtcDay("2026-09-26T00:00:00.000Z", NOW)).toBe(false);
  });

  it("is false just before midnight UTC the same day started", () => {
    expect(isSameUtcDay("2026-09-24T23:59:00.000Z", NOW)).toBe(false);
  });

  it("is false a week out", () => {
    expect(isSameUtcDay("2026-10-02T18:00:00.000Z", NOW)).toBe(false);
  });
});
