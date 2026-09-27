import { describe, expect, it } from "vitest";

import { formatRelativeTime, sortByPublishedAt, type NewsItem } from "@/lib/news-view";

function item(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: "Bitcoin holds above key level",
    url: "https://example.com/article",
    source: "example.com",
    publishedAt: "2026-09-27T12:00:00.000Z",
    ...overrides,
  };
}

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-27T12:00:00.000Z").getTime();

  it("reads as just now for anything under a minute old", () => {
    expect(formatRelativeTime(new Date(now - 30_000).toISOString(), now)).toBe("Just now");
  });

  it("reads in minutes under an hour old", () => {
    expect(formatRelativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5m ago");
  });

  it("reads in hours under a day old", () => {
    expect(formatRelativeTime(new Date(now - 3 * 3600_000).toISOString(), now)).toBe("3h ago");
  });

  it("reads in days once a day or older", () => {
    expect(formatRelativeTime(new Date(now - 2 * 24 * 3600_000).toISOString(), now)).toBe("2d ago");
  });
});

describe("sortByPublishedAt", () => {
  it("sorts newest first without mutating the input", () => {
    const older = item({ title: "older", publishedAt: "2026-09-27T10:00:00.000Z" });
    const newer = item({ title: "newer", publishedAt: "2026-09-27T11:00:00.000Z" });
    const input = [older, newer];

    const sorted = sortByPublishedAt(input);

    expect(sorted).toEqual([newer, older]);
    expect(input).toEqual([older, newer]);
  });
});
