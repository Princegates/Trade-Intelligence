// The shape of a news headline as the UI sees it, plus the pure helpers
// that read it. Free of `server-only` and of any data access, like
// calendar-view.ts and signal-view.ts — these are ordinary functions, kept
// testable.

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
}

export function sortByPublishedAt(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A short "how long ago" label for a headline's byline — "Just now", "5m
 * ago", "3h ago", "2d ago". Deliberately coarse (no seconds, no weeks):
 * this is a trust signal ("this dashboard has current information"), not a
 * precise timestamp, and a headline older than a few days shouldn't still
 * be showing up here in the first place. */
export function formatRelativeTime(publishedAt: string, now: number): string {
  const deltaMs = now - new Date(publishedAt).getTime();
  if (deltaMs < MINUTE) return "Just now";
  if (deltaMs < HOUR) return `${Math.floor(deltaMs / MINUTE)}m ago`;
  if (deltaMs < DAY) return `${Math.floor(deltaMs / HOUR)}h ago`;
  return `${Math.floor(deltaMs / DAY)}d ago`;
}
