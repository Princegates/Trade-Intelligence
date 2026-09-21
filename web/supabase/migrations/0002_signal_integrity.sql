-- Trade Intelligence: signal integrity.
-- Brings the Supabase mirror back in line with the Python engine
-- (see ../../../src/storage/db.py): every signal carries the version that
-- produced it, a published signal is never rewritten, and a signal that was
-- withheld leaves the reason behind.

-- ---------------------------------------------------------------------------
-- Lineage: enough to reproduce a past call from its inputs.
-- `confidence` stays null until there are resolved signals to calibrate it
-- against — a number derived from `score` would only restate how many
-- indicators agreed, not how often that agreement has been right.
-- ---------------------------------------------------------------------------
alter table public.signals
  add column if not exists confidence double precision,
  add column if not exists evidence_count integer not null default 0,
  add column if not exists strategy_version text not null default '1.0.0';

-- ---------------------------------------------------------------------------
-- Identity now includes the strategy version: re-scoring a candle under new
-- logic publishes a new signal *alongside* the original rather than editing
-- it. Dropping the update policy makes that immutability structural — no
-- role, admin included, can rewrite a call after publication.
-- ---------------------------------------------------------------------------
alter table public.signals
  drop constraint if exists signals_symbol_timeframe_candle_time_key;

create unique index if not exists signals_identity_idx
  on public.signals (symbol, timeframe, candle_time, strategy_version);

drop policy if exists "signals: admins update" on public.signals;

-- ---------------------------------------------------------------------------
-- signal_suppressions: why a candidate signal was not published. A missing
-- signal should always be explainable, never just absent.
-- Reasons in use: FETCH_FAILED, NO_DATA, BAD_CANDLE, INSUFFICIENT_HISTORY,
-- STALE_DATA. Deliberately not a CHECK constraint, so the engine can add a
-- reason code without needing a migration first.
-- ---------------------------------------------------------------------------
create table if not exists public.signal_suppressions (
  id bigint generated always as identity primary key,
  symbol text not null,
  timeframe text not null,
  observed_at timestamptz not null,
  reason text not null,
  detail text not null default ''
);

alter table public.signal_suppressions enable row level security;

drop policy if exists "signal_suppressions: admins read" on public.signal_suppressions;
create policy "signal_suppressions: admins read" on public.signal_suppressions
  for select using (public.is_admin(auth.uid()));

drop policy if exists "signal_suppressions: admins write" on public.signal_suppressions;
create policy "signal_suppressions: admins write" on public.signal_suppressions
  for insert with check (public.is_admin(auth.uid()));

create index if not exists signal_suppressions_observed_idx
  on public.signal_suppressions (symbol, timeframe, observed_at desc);
