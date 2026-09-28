"use server";

import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { actorOf, logActivity } from "@/lib/activity-log";

/** Forces getMarketNews()'s next call to skip its 20-minute cache and hit
 * Marketaux fresh. Exists because that cache is a Vercel Data Cache entry
 * that persists across deploys (by design, so time-based revalidation
 * works without a rebuild) — after changing the provider config or symbol
 * logic, waiting up to 20 minutes to see the effect isn't necessary once
 * an admin can just ask for it directly. */
export async function refreshMarketNewsCache() {
  const admin = await requireAdmin();
  // { expire: 0 }, not the recommended "max" profile: an admin pressing
  // this button wants the next load to actually be fresh, not served
  // stale content while a background refetch happens.
  revalidateTag("market-news", { expire: 0 });
  logActivity({ action: "admin.news_cache_refreshed", actor: actorOf(admin) });
  return { success: true };
}
