// Shared site-wide constants for anything that needs the brand name,
// description, or canonical URL — root metadata, sitemap.ts, robots.ts,
// opengraph-image.tsx, and any page's own JSON-LD — so they can't drift
// into disagreeing with each other.

export const SITE_NAME = "SignalsVault AI";

export const SITE_DESCRIPTION =
  "Trade intelligence for BTC and gold: rule-based signals with the reasoning behind every call, and a track record you can audit.";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
