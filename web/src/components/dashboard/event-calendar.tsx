import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { affectedInstruments, isSameUtcDay, isWithinWindow, sortByTime, type CalendarEvent } from "@/lib/calendar";
import { ASSET_NAMES } from "@/lib/signals";

function impactVariant(impact: string) {
  const normalized = impact.toLowerCase();
  if (normalized === "high") return "destructive" as const;
  if (normalized === "medium") return "warning" as const;
  return "secondary" as const;
}

function fmt(value: string | null) {
  return value ?? "—";
}

const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });

const timeOnly = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** One event's effect on our own signals, described exactly — no claim
 * about which way price might move, only what the engine actually does and
 * when (spec sections 6/13, enforced in src/signals/event_risk.py). */
function AffectedNote({ event, now }: { event: CalendarEvent; now: number }) {
  const affected = affectedInstruments(event);
  if (affected.length === 0) return null;

  const live = isWithinWindow(event, now);

  return (
    <p className="mt-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
      <span className={`font-medium ${live ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
        {live ? "Holding now" : "Will hold"}
      </span>{" "}
      {affected.map((a) => ASSET_NAMES[a.symbol] ?? a.symbol).join(", ")} to HOLD from {timeOnly(affected[0].holdFrom)} to{" "}
      {timeOnly(affected[0].holdUntil)} — spread widens and price can spike either way while the market digests this
      release.
    </p>
  );
}

function EventRow({ event, now }: { event: CalendarEvent; now: number }) {
  return (
    <li className="border-b py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={impactVariant(event.impact)}>{event.impact}</Badge>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{event.country}</span>
        <span className="text-sm font-medium text-foreground">{event.title}</span>
        <span className="ml-auto text-xs text-muted-foreground">{time(event.eventTime)}</span>
      </div>
      {(event.forecast || event.previous || event.actual) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {event.actual && (
            <>
              Actual <span className="font-mono text-foreground">{fmt(event.actual)}</span> ·{" "}
            </>
          )}
          Forecast <span className="font-mono text-foreground">{fmt(event.forecast)}</span> · Previous{" "}
          <span className="font-mono text-foreground">{fmt(event.previous)}</span>
        </p>
      )}
      <AffectedNote event={event} now={now} />
    </li>
  );
}

function EventList({ events, now, emptyLabel }: { events: CalendarEvent[]; now: number; emptyLabel: string }) {
  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No {emptyLabel} events loaded.</p>;
  }
  return (
    <ul>
      {events.map((event) => (
        <EventRow key={`${event.title}-${event.country}-${event.eventTime}`} event={event} now={now} />
      ))}
    </ul>
  );
}

/** The economic calendar, and exactly what it does to our own signals —
 * nothing about which way price might move, only what the engine actually
 * does and when. See "Economic calendar" in the README for the source and
 * its limits.
 *
 * Defaults to today rather than dumping the whole week at once; "This week"
 * is a tab away for whoever wants to look further out. Both tabs read from
 * the same already-fetched `events` (a week's worth, same window the
 * event-risk gate itself uses) — switching tabs filters client-side rather
 * than firing a second request. */
export function EventCalendar({ events, now }: { events: CalendarEvent[]; now: number }) {
  const ordered = sortByTime(events);
  const today = ordered.filter((e) => isSameUtcDay(e.eventTime, now));

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h2 className="mb-1 text-sm font-semibold">Economic calendar</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          High-impact USD releases hold gold to HOLD around them — see each event below. Bitcoin is never gated by
          this calendar.
        </p>

        <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">This week</TabsTrigger>
          </TabsList>
          <TabsContent value="today">
            <EventList events={today} now={now} emptyLabel="today's" />
          </TabsContent>
          <TabsContent value="week">
            <EventList events={ordered} now={now} emptyLabel="upcoming" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
