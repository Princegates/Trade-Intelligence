-- Trade Intelligence: the economic calendar events that gate gold.
--
-- Mirrored from src/ingest/calendar.py so the dashboard can show what's
-- coming up and why a signal went quiet, without the browser hitting a
-- third-party feed directly.
--
-- Not append-only, unlike signals: a forecast can legitimately be revised,
-- and an actual value arrives after release, so a later fetch of the same
-- event is meant to update the row, not coexist beside it.
--
-- Safe to re-run.

create table if not exists public.economic_events (
  title text not null,
  country text not null,
  event_time timestamptz not null,
  impact text not null,
  forecast text,
  previous text,
  actual text,
  fetched_at timestamptz not null default now(),
  primary key (title, country, event_time)
);

alter table public.economic_events enable row level security;

drop policy if exists "economic_events: authenticated users read" on public.economic_events;
create policy "economic_events: authenticated users read" on public.economic_events
  for select using (auth.role() = 'authenticated');

-- Writes come from the cron job's service key, which bypasses RLS; no
-- client-facing role is granted insert or update.

-- The only access pattern the dashboard has: what's coming up, in order.
create index if not exists economic_events_time_idx
  on public.economic_events (event_time);
