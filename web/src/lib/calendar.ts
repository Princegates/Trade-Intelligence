import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_EVENTS } from "@/lib/demo-data";
import type { Database } from "@/lib/supabase/types";
import type { CalendarEvent } from "@/lib/calendar-view";

export { affectedInstruments, isSameUtcDay, isWithinWindow, sortByTime, EVENT_RISK_CURRENCY } from "@/lib/calendar-view";
export type { CalendarEvent, AffectedInstrument } from "@/lib/calendar-view";

type Client = SupabaseClient<Database>;

async function readUpcomingEvents(supabase: Client): Promise<CalendarEvent[]> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const until = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();

  const { data, error } = await supabase
    .from("economic_events")
    .select("*")
    .gte("event_time", since)
    .lte("event_time", until)
    .order("event_time", { ascending: true })
    .limit(200);

  if (error || !data) return [];

  return data.map((row) => ({
    title: row.title,
    country: row.country,
    eventTime: row.event_time,
    impact: row.impact,
    forecast: row.forecast,
    previous: row.previous,
    actual: row.actual,
  }));
}

// Same reasoning as signals.ts's CACHE_SECONDS: every dashboard viewer is
// already an approved user or admin (src/lib/auth.ts#requireUser), so
// economic_events' `has_access()` RLS check is redundant with that page-level
// gate — which is what makes reading it through the service-role client
// safe to share across every viewer for a short window.
const getCachedUpcomingEvents = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    if (!supabase) return [];
    return readUpcomingEvents(supabase);
  },
  ["upcoming-events"],
  { revalidate: 30, tags: ["economic-events"] }
);

/** Events from a day ago through a week out — wide enough to show what just
 * happened (with its actual value, once released) and what's coming, without
 * pulling in a month of low-impact noise the dashboard has no use for. */
export async function getUpcomingEvents(): Promise<CalendarEvent[]> {
  if (!isSupabaseConfigured()) return DEMO_EVENTS;

  if (createServiceClient()) return getCachedUpcomingEvents();

  const supabase = await createClient();
  if (!supabase) return [];
  return readUpcomingEvents(supabase);
}
