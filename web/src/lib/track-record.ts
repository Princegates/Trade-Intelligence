import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export interface TrackRecordStat {
  /** 0-100, rounded. */
  rate: number;
  confirmedCount: number;
  invalidatedCount: number;
  isDemo: boolean;
}

// signal_lifecycle is anon-readable (migration 0018), so this isn't an RLS
// concern the way the dashboard's cached reads are — the service-role
// client here is purely to dodge unstable_cache's "no cookies()" rule
// (the per-request client needs cookies() to build), not to see anything
// an anonymous visitor couldn't already query directly.
//
// CONFIRMED means price moved at least 1R favorably from entry before
// hitting the invalidation level (src/signals/lifecycle.py#next_state) —
// a real, meaningful outcome, but not the same claim as "hit its full
// target." Worded on the homepage accordingly. EXPIRED (timed out, neither
// confirmed nor invalidated) and non-terminal states are excluded — this
// is a rate among calls that actually resolved one way or the other, not
// of everything ever published.
const getCachedCounts = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    if (!supabase) return null;

    const [{ count: confirmedCount }, { count: invalidatedCount }] = await Promise.all([
      supabase.from("signal_lifecycle").select("*", { count: "exact", head: true }).eq("state", "CONFIRMED"),
      supabase.from("signal_lifecycle").select("*", { count: "exact", head: true }).eq("state", "INVALIDATED"),
    ]);

    return { confirmedCount: confirmedCount ?? 0, invalidatedCount: invalidatedCount ?? 0 };
  },
  ["track-record-counts"],
  { revalidate: 1800, tags: ["track-record"] }
);

/** null means "don't show the stat" — demo mode aside, that's true both
 * when nothing has resolved yet and when the counts can't be read at all;
 * a trust signal with no real backing is worse than no trust signal. */
export async function getTrackRecordStat(): Promise<TrackRecordStat | null> {
  if (!isSupabaseConfigured()) {
    // A plausible, clearly-labeled sample number — same honesty rule as
    // the homepage's own preview cards (DEMO_SIGNALS), never presented as
    // real. See the `isDemo` flag the homepage uses to add "(sample)".
    return { rate: 68, confirmedCount: 41, invalidatedCount: 19, isDemo: true };
  }

  const counts = await getCachedCounts();
  if (!counts) return null;

  const resolved = counts.confirmedCount + counts.invalidatedCount;
  if (resolved === 0) return null;

  return {
    rate: Math.round((counts.confirmedCount / resolved) * 100),
    confirmedCount: counts.confirmedCount,
    invalidatedCount: counts.invalidatedCount,
    isDemo: false,
  };
}
