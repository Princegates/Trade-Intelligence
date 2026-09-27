import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_NEWS } from "@/lib/demo-data";
import { sortByPublishedAt, type NewsItem } from "@/lib/news-view";

const MAX_HEADLINES = 6;

// A trust signal ("this dashboard has current information"), not a feed
// traders act on — a 20-minute window is plenty fresh for that, and stays
// comfortably under Marketaux's free-tier 100-requests/day cap (a shorter
// window shared across every viewer would risk exceeding it on a busy day;
// see signals.ts's CACHE_SECONDS for the same reasoning applied to
// Supabase's own read load).
const CACHE_SECONDS = 1200;

interface NewsProvider {
  provider: string;
  config: Record<string, string>;
}

async function getActiveNewsProvider(): Promise<NewsProvider | null> {
  const supabase = createServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("app_settings")
    .select("provider, config")
    .eq("category", "news")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { provider: data.provider, config: (data.config as Record<string, string>) ?? {} };
}

/** Calls Marketaux's /v1/news/all, filtered to the two instruments this
 * dashboard tracks. Returns [] on any failure (missing token, network
 * error, rate limit, or a response shape that doesn't parse) — a news
 * provider outage should silently hide the card, never break the
 * dashboard.
 *
 * NOTE: written from Marketaux's published API shape, not verified against
 * a live response (this environment's network policy blocks
 * marketaux.com). Re-check the field names below — `data[].title/url/
 * source/published_at` — against a real response once a token is
 * configured, before relying on this beyond "card shows or doesn't". */
async function fetchFromMarketaux(apiToken: string): Promise<NewsItem[]> {
  const url = new URL("https://api.marketaux.com/v1/news/all");
  url.searchParams.set("api_token", apiToken);
  url.searchParams.set("symbols", "BTC,XAU");
  url.searchParams.set("filter_entities", "true");
  url.searchParams.set("language", "en");
  url.searchParams.set("limit", String(MAX_HEADLINES));

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      console.error(`[news] Marketaux ${response.status} ${response.statusText}`);
      return [];
    }

    const body = await response.json();
    const articles: unknown = body?.data;
    if (!Array.isArray(articles)) return [];

    const items: NewsItem[] = [];
    for (const a of articles) {
      const title = a?.title;
      const articleUrl = a?.url;
      const source = a?.source;
      const publishedAt = a?.published_at;
      if (
        typeof title === "string" &&
        typeof articleUrl === "string" &&
        typeof source === "string" &&
        typeof publishedAt === "string"
      ) {
        items.push({ title, url: articleUrl, source, publishedAt });
      }
    }
    return sortByPublishedAt(items).slice(0, MAX_HEADLINES);
  } catch (exc) {
    console.error(`[news] Marketaux request failed: ${exc}`);
    return [];
  }
}

const getCachedMarketNews = unstable_cache(
  async () => {
    const provider = await getActiveNewsProvider();
    if (!provider || provider.provider !== "marketaux") return [] as NewsItem[];

    const apiToken = provider.config.api_token;
    if (!apiToken) return [] as NewsItem[];

    return fetchFromMarketaux(apiToken);
  },
  ["market-news"],
  { revalidate: CACHE_SECONDS, tags: ["market-news"] }
);

/** Recent BTC/gold-relevant headlines for the dashboard's Market News card.
 * [] means "don't show the card" — no configured provider, an admin
 * hasn't set one up yet, or the provider call failed, are all the same
 * case from the UI's point of view. */
export async function getMarketNews(): Promise<NewsItem[]> {
  if (!isSupabaseConfigured()) return DEMO_NEWS;

  // Shared across every viewer for CACHE_SECONDS — same reasoning as the
  // dashboard's other cached reads (signals.ts): this is the same content
  // for everyone regardless of who asks, so one Marketaux call replaces
  // one per page load.
  return getCachedMarketNews();
}
