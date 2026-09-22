// The shape of a calendar event as the UI sees it, plus the pure helpers
// that read it. Free of `server-only` and of any data access, like
// signal-view.ts — these are ordinary functions, kept testable.

export interface CalendarEvent {
  title: string;
  country: string;
  eventTime: string; // ISO
  impact: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
}

// Mirrors src/config.py's EVENT_RISK_CURRENCY / EVENT_RISK_BEFORE_MINUTES /
// EVENT_RISK_AFTER_MINUTES exactly — keep these in sync if either changes.
// Gold is the only symbol mapped; BTC is deliberately absent (src/run.py's
// own comment explains why: funding/leverage/liquidations, not a macro
// calendar, and there is no free feed for those either).
export const EVENT_RISK_CURRENCY: Record<string, string> = { XAUUSD: "USD" };
export const EVENT_RISK_BEFORE_MINUTES = 30;
export const EVENT_RISK_AFTER_MINUTES = 60;

export interface AffectedInstrument {
  symbol: string;
  holdFrom: string; // ISO
  holdUntil: string; // ISO
}

/** Which of our own tracked instruments this event holds to HOLD, and the
 * exact window it does so in — grounded in what src/signals/event_risk.py
 * actually does, not a prediction about which way price might move. Medium
 * and Low impact never gate anything, matching the engine. */
export function affectedInstruments(event: CalendarEvent): AffectedInstrument[] {
  if (event.impact.toLowerCase() !== "high") return [];

  const eventMs = new Date(event.eventTime).getTime();
  const holdFrom = new Date(eventMs - EVENT_RISK_BEFORE_MINUTES * 60_000).toISOString();
  const holdUntil = new Date(eventMs + EVENT_RISK_AFTER_MINUTES * 60_000).toISOString();

  return Object.entries(EVENT_RISK_CURRENCY)
    .filter(([, currency]) => currency === event.country)
    .map(([symbol]) => ({ symbol, holdFrom, holdUntil }));
}

/** Whether `now` falls inside the window this event would already be
 * holding a matching instrument for — used to badge a card "in progress"
 * rather than merely upcoming or past. */
export function isWithinWindow(event: CalendarEvent, now: number): boolean {
  const affected = affectedInstruments(event);
  if (affected.length === 0) return false;
  const { holdFrom, holdUntil } = affected[0];
  return now >= new Date(holdFrom).getTime() && now <= new Date(holdUntil).getTime();
}

export function sortByTime(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
}
