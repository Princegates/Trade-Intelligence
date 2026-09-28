import { describe, expect, it } from "vitest";
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_CATEGORIES,
  actionCategory,
  actionLabel,
  activityToCsv,
  clientIp,
  describeUserAgent,
  diffFields,
  filtersToQuery,
  formatDetails,
  matchesFilters,
  parseActivityFilters,
  type ActivityView,
} from "./activity-log-view";

const row = (overrides: Partial<ActivityView> = {}): ActivityView => ({
  id: 1,
  createdAt: new Date("2026-09-28T12:00:00Z").toISOString(),
  actorId: "u1",
  actorEmail: "trader@example.com",
  actorRole: "user",
  action: "auth.signed_in",
  targetType: null,
  targetId: null,
  targetLabel: null,
  details: {},
  outcome: "success",
  ip: "203.0.113.24",
  userAgent: null,
  ...overrides,
});

describe("action catalog", () => {
  it("files every action under a known category", () => {
    const categories = new Set<string>(ACTIVITY_CATEGORIES.map((c) => c.key));
    for (const action of Object.keys(ACTIVITY_ACTIONS)) expect(categories).toContain(actionCategory(action));
  });

  it("labels known actions and passes unknown ones through", () => {
    expect(actionLabel("auth.signed_in")).toBe("Signed in");
    expect(actionLabel("something.new")).toBe("something.new");
  });
});

describe("clientIp", () => {
  const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;

  it("takes the first x-forwarded-for hop", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.24, 10.0.0.1" }))).toBe("203.0.113.24");
  });

  it("falls back to x-real-ip, then null", () => {
    expect(clientIp(headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(headers({}))).toBeNull();
  });
});

describe("describeUserAgent", () => {
  it("names browser and OS", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"
      )
    ).toBe("Edge on Windows");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
      )
    ).toBe("Safari on iOS");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      )
    ).toBe("Chrome on macOS");
  });

  it("handles missing and unrecognised agents", () => {
    expect(describeUserAgent(null)).toBeNull();
    expect(describeUserAgent("curl/8.4.0")).toBe("Other");
  });
});

describe("diffFields / formatDetails", () => {
  it("keeps only changed fields", () => {
    expect(diffFields({ "Trial days": 7, "Code expiry": 14 }, { "Trial days": 10, "Code expiry": 14 })).toEqual({
      "Trial days": { from: 7, to: 10 },
    });
  });

  it("treats a number and its string form as unchanged", () => {
    expect(diffFields({ Ratio: 2 }, { Ratio: "2" })).toEqual({});
  });

  it("formats changes and plain details", () => {
    expect(
      formatDetails({ changes: { "Trial days": { from: 7, to: 10 } }, reason: "Invalid login", enabled: false })
    ).toEqual(["Trial days: 7 → 10", "Reason: Invalid login", "Enabled: off"]);
    expect(formatDetails({ fields_updated: ["api_key", "model"] })).toEqual(["Fields updated: api_key, model"]);
  });
});

describe("filters", () => {
  it("parses valid params and defaults the rest", () => {
    expect(parseActivityFilters({ q: " jane ", category: "admin", outcome: "failure", since: "30d", page: "3" })).toEqual({
      q: "jane",
      category: "admin",
      outcome: "failure",
      since: "30d",
      page: 3,
    });
    expect(parseActivityFilters({ category: "nope", outcome: "maybe", since: "1y", page: "-2" })).toEqual({
      q: "",
      category: "",
      outcome: "",
      since: "7d",
      page: 1,
    });
  });

  it("strips characters that could break the database filter", () => {
    expect(parseActivityFilters({ q: "a,b)(or.id.eq.1*%" }).q).toBe("abor.id.eq.1");
  });

  it("matches rows the way the database query does", () => {
    const now = new Date("2026-09-28T13:00:00Z").getTime();
    const f = parseActivityFilters({});
    expect(matchesFilters(row(), { ...f, q: "TRADER" }, now)).toBe(true);
    expect(matchesFilters(row(), { ...f, q: "jane" }, now)).toBe(false);
    expect(matchesFilters(row({ targetLabel: "jane@example.com" }), { ...f, q: "jane" }, now)).toBe(true);
    expect(matchesFilters(row(), { ...f, category: "admin" }, now)).toBe(false);
    expect(matchesFilters(row(), { ...f, outcome: "failure" }, now)).toBe(false);
    expect(matchesFilters(row(), { ...f, since: "24h" }, now + 2 * 24 * 3600 * 1000)).toBe(false);
    expect(matchesFilters(row(), { ...f, since: "all" }, now + 400 * 24 * 3600 * 1000)).toBe(true);
  });

  it("builds short query strings", () => {
    const f = parseActivityFilters({});
    expect(filtersToQuery(f)).toBe("");
    expect(filtersToQuery({ ...f, q: "jane", category: "auth" }, { page: 2 })).toBe("?q=jane&category=auth&page=2");
  });
});

describe("activityToCsv", () => {
  it("writes a header and escapes cells", () => {
    const csv = activityToCsv([
      row({ details: { reason: 'bad "quote", comma' }, userAgent: "curl/8" }),
      row({ actorEmail: "=HYPERLINK(1)" }),
    ]);
    const [header, first, second] = csv.split("\r\n");
    expect(header).toBe("Time (UTC),User,Role,Action,Target,Details,Outcome,IP,Device");
    expect(first).toContain('"Reason: bad ""quote"", comma"');
    expect(first).toContain(",Other");
    expect(second).toContain(",'=HYPERLINK(1),");
  });
});
