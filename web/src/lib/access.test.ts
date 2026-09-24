import { describe, expect, it } from "vitest";

import { hasFullAccess, daysRemaining, type AccessSubject } from "@/lib/access";

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const days = (n: number) => new Date(NOW + n * 24 * 3600 * 1000).toISOString();

function user(fullAccessUntil: string | null): AccessSubject {
  return { role: "user", fullAccessUntil };
}

describe("hasFullAccess", () => {
  it("is always true for an admin, regardless of fullAccessUntil", () => {
    expect(hasFullAccess({ role: "admin", fullAccessUntil: null }, NOW)).toBe(true);
    expect(hasFullAccess({ role: "admin", fullAccessUntil: days(-10) }, NOW)).toBe(true);
  });

  it("is false for a user with no expiry set", () => {
    expect(hasFullAccess(user(null), NOW)).toBe(false);
  });

  it("is true while the expiry is still in the future", () => {
    expect(hasFullAccess(user(days(3)), NOW)).toBe(true);
  });

  it("is false once the expiry has passed", () => {
    expect(hasFullAccess(user(days(-1)), NOW)).toBe(false);
  });

  it("is false at the exact expiry instant (not inclusive)", () => {
    expect(hasFullAccess(user(new Date(NOW).toISOString()), NOW)).toBe(false);
  });
});

describe("daysRemaining", () => {
  it("is null for an admin", () => {
    expect(daysRemaining({ role: "admin", fullAccessUntil: days(3) }, NOW)).toBeNull();
  });

  it("is null for a user with no expiry set", () => {
    expect(daysRemaining(user(null), NOW)).toBeNull();
  });

  it("rounds a partial day up, so 'expires in an hour' still reads as 1 day left, not 0", () => {
    const inOneHour = new Date(NOW + 3600 * 1000).toISOString();
    expect(daysRemaining(user(inOneHour), NOW)).toBe(1);
  });

  it("is never negative once the trial has expired", () => {
    expect(daysRemaining(user(days(-5)), NOW)).toBe(0);
  });

  it("counts whole days left correctly", () => {
    expect(daysRemaining(user(days(5)), NOW)).toBe(5);
  });
});
