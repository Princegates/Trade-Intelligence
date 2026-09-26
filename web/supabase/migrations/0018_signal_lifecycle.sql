-- Trade Intelligence: signal lifecycle state, Phase 2b of the entry-quality
-- engine (src/signals/lifecycle.py, STRATEGY_VERSION 3.1.0+).
--
-- Everything else about a signal is computed once at generation time and
-- left alone — public.signals is hard append-only (0003_signals_append_
-- only.sql). This is the one piece that genuinely changes over time: as
-- new candles close, src/run.py::recheck_lifecycles() re-evaluates each
-- open signal's state (WAIT -> WATCH -> READY -> CONFIRMED, or resolves
-- early to INVALIDATED/EXPIRED) and writes it here instead.
--
-- Two tables, same identity tuple signals/signal_commentary already use
-- (symbol, timeframe, candle_time, strategy_version), no foreign key —
-- same reasoning as signal_commentary (0012): the app already has the
-- tuple, and signals is append-only anyway so nothing to join against
-- would move.
--
-- signal_lifecycle is the current, mutable state (upserted on every
-- re-check — mirrors economic_events' upsert shape, 0007, not signal_
-- commentary's ignore-duplicates shape, since state must genuinely
-- change). signal_lifecycle_transitions is an append-only log of actual
-- state CHANGES only, not every re-check: a row is re-checked roughly
-- every 5 minutes for its whole open life but transitions at most 5-6
-- times ever, so logging every check would bloat this table for no
-- product value. It answers "when did WATCH become READY" — something
-- signal_lifecycle.updated_at can't, since that gets bumped on every
-- no-op re-check too.
--
-- Safe to re-run.

create table if not exists public.signal_lifecycle (
  symbol text not null,
  timeframe text not null,
  candle_time timestamptz not null,
  strategy_version text not null,
  state text not null default 'WAIT'
    check (state in ('WAIT', 'WATCH', 'READY', 'CONFIRMED', 'INVALIDATED', 'EXPIRED')),
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_price double precision,
  last_checked_candle_time timestamptz,
  primary key (symbol, timeframe, candle_time, strategy_version)
);

comment on table public.signal_lifecycle is
  'Current lifecycle state of a tracked signal, re-evaluated on every scheduled run — see src/signals/lifecycle.py and src/run.py::recheck_lifecycles(). Only directional calls with real structural entry-zone/invalidation data get a row (src/signals/lifecycle.py::tracks()); HOLD and ATR-fallback calls never do.';
comment on column public.signal_lifecycle.entered_at is
  'When the CURRENT state began — distinct from updated_at, which is bumped on every re-check even when the state does not change.';
comment on column public.signal_lifecycle.last_price is
  'The closed-candle price this row was last re-checked against.';

create index if not exists signal_lifecycle_open_idx on public.signal_lifecycle (state)
  where state in ('WAIT', 'WATCH', 'READY');

alter table public.signal_lifecycle enable row level security;

drop policy if exists "signal_lifecycle: authenticated reads" on public.signal_lifecycle;
create policy "signal_lifecycle: authenticated reads" on public.signal_lifecycle
  for select to authenticated using (true);

drop policy if exists "signal_lifecycle: anon reads" on public.signal_lifecycle;
create policy "signal_lifecycle: anon reads" on public.signal_lifecycle
  for select to anon using (true);

create table if not exists public.signal_lifecycle_transitions (
  symbol text not null,
  timeframe text not null,
  candle_time timestamptz not null,
  strategy_version text not null,
  from_state text not null,
  to_state text not null,
  price double precision,
  transitioned_at timestamptz not null default now(),
  primary key (symbol, timeframe, candle_time, strategy_version, transitioned_at)
);

comment on table public.signal_lifecycle_transitions is
  'Append-only log of signal_lifecycle state CHANGES only (not every re-check) — when a tracked signal actually moved from one state to another.';

alter table public.signal_lifecycle_transitions enable row level security;

drop policy if exists "signal_lifecycle_transitions: authenticated reads" on public.signal_lifecycle_transitions;
create policy "signal_lifecycle_transitions: authenticated reads" on public.signal_lifecycle_transitions
  for select to authenticated using (true);

drop policy if exists "signal_lifecycle_transitions: anon reads" on public.signal_lifecycle_transitions;
create policy "signal_lifecycle_transitions: anon reads" on public.signal_lifecycle_transitions
  for select to anon using (true);

-- Realtime: signal_lifecycle only — transitions are queried on demand
-- (rendered as one more fact in the card's technical-details list), not
-- needed for the live badge.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'signal_lifecycle'
  ) then
    alter publication supabase_realtime add table public.signal_lifecycle;
  end if;
end $$;
