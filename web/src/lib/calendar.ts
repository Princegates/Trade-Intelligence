import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { DEMO_EVENTS } from "@/lib/demo-data";
import type { CalendarEvent } from "@/lib/calendar-view";

export { affectedInstruments, isWithinWindow, sortByTime, EVENT_RISK_CURRENCY } from "@/lib/calendar-view";
export type { CalendarEvent, AffectedInstrument } from "@/lib/calendar-view";

/** Events from a day ago through a week out — wide enough to show what just
 * happened (with its actual value, once released) and what's coming, without
 * pulling in a month of low-impact noise the dashboard has no use for. */
export async function getUpcomingEvents(): Promise<CalendarEvent[]> {
  if (!isSupabaseConfigured()) return DEMO_EVENTS;

  const supabase = await createClient();
  if (!supabase) return [];

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
