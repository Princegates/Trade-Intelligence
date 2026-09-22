import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { affectedInstruments, isWithinWindow, sortByTime, type CalendarEvent } from "@/lib/calendar";
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

/** The economic calendar, and exactly what it does to our own signals —
 * nothing about which way price might move, only what the engine actually
 * does and when. See "Economic calendar" in the README for the source and
 * its limits. */
export function EventCalendar({ events, now }: { events: CalendarEvent[]; now: number }) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No calendar events loaded for this window.
        </CardContent>
      </Card>
    );
  }

  const ordered = sortByTime(events);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Economic calendar</h2>
          <span className="text-xs text-muted-foreground">Next 7 days</span>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          High-impact USD releases hold gold to HOLD around them — see each event below. Bitcoin is never gated by
          this calendar.
        </p>
        <ul>
          {ordered.map((event) => (
            <EventRow key={`${event.title}-${event.country}-${event.eventTime}`} event={event} now={now} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
