-- Trade Intelligence: ALIVEDESTINY, a second and fully independent trading
-- strategy (15m Break & Retest -> Fibonacci retracement -> candlestick
-- confirmation) published alongside the confluence engine's own signals,
-- never replacing them. See src/signals/setups.py.
--
-- Three tables, none touching public.signals (that table's own append-only
-- trigger, 0003_signals_append_only.sql, is scoped to it specifically and
-- is unaffected either way):
--
-- alivedestiny_setups is the ONE genuinely new kind of state this codebase
-- needed for ALIVEDESTINY: a candidate setup tracked from the moment its
-- Break of Structure is detected, across many scheduled runs, through
-- publish/invalidation/expiry. Mutable, upserted on every re-check, same
-- shape as signal_lifecycle (0018_signal_lifecycle.sql) — current state +
-- entered_at/updated_at + a partial index on non-terminal states. Unlike
-- signal_lifecycle, which is 1:1 with an already-published signal, a
-- (symbol, timeframe) pair can have MULTIPLE concurrent open setups: each
-- Break of Structure is independent evidence, and an earlier still-open
-- setup is never invalidated just because a newer one appears — it
-- resolves or expires on its own.
--
-- alivedestiny_setup_transitions logs actual state CHANGES only (not
-- every re-check), same "small, append-only, one insert per real
-- transition" shape as signal_lifecycle_transitions.
--
-- alivedestiny_signals is the published output — a NEW, dedicated table
-- rather than more nullable columns on public.signals: ALIVEDESTINY's
-- ~20 fields (Fibonacci levels, impulse size, BOS strength, confirmation
-- pattern) would be permanently null on every confluence-engine row and
-- vice versa, unlike every previous phase's columns, which applied to
-- every row regardless of verdict. Append-only, same trigger pattern as
-- 0003, for the same reason: a correction is a new setup's own signal,
-- never an edit to this one. Always exactly one row per resolved setup —
-- a BUY/SELL when every mandatory gate passes, or a structured NO_TRADE
-- when a setup is invalidated or expires. "NO TRADE" is a first-class,
-- visible output here, never silence.
--
-- Safe to re-run.

create table if not exists public.alivedestiny_signals (
  id bigint generated always as identity primary key,
  symbol text not null,
  timeframe text not null,
  setup_id uuid not null,
  bos_candle_time timestamptz not null,
  generated_at timestamptz not null,
  strategy_version text not null,
  verdict text not null check (verdict in ('BUY', 'SELL', 'NO_TRADE')),
  price double precision not null,
  reasoning text not null,
  no_trade_reason text,
  bos_kind text not null check (bos_kind in ('BOS', 'CHoCH')),
  bos_direction integer not null check (bos_direction in (-1, 1)),
  bos_price double precision not null,
  break_strength text check (break_strength in ('STRONG', 'NORMAL', 'WEAK')),
  impulse_start_price double precision,
  impulse_end_price double precision,
  impulse_atr_multiple double precision,
  fib_50 double precision,
  fib_61_8 double precision,
  fib_72 double precision,
  fib_78_6 double precision,
  retracement_quality text check (retracement_quality in ('SHALLOW', 'VALID', 'DEEP', 'FAILED')),
  retest_confirmed boolean,
  confirmation_pattern text,
  candle_quality text check (candle_quality in ('STRONG', 'NORMAL', 'WEAK')),
  htf_bias text,
  htf_filter_outcome text check (htf_filter_outcome in ('ALIGNED', 'NEUTRAL', 'DOWNGRADED', 'REJECTED')),
  entry double precision,
  stop double precision,
  target double precision,
  risk_reward double precision,
  regime text,
  confidence_score integer,
  unique (symbol, timeframe, bos_candle_time, strategy_version)
);

comment on table public.alivedestiny_signals is
  'ALIVEDESTINY''s published output — BUY/SELL or a structured NO_TRADE — one row per resolved setup. See src/signals/setups.py.';
comment on column public.alivedestiny_signals.confidence_score is
  'Diagnostic 0-100 quality read, never a gate substitute — populated in a later phase, NULL here.';

alter table public.alivedestiny_signals enable row level security;

drop policy if exists "alivedestiny_signals: authenticated reads" on public.alivedestiny_signals;
create policy "alivedestiny_signals: authenticated reads" on public.alivedestiny_signals
  for select to authenticated using (true);

drop policy if exists "alivedestiny_signals: anon reads" on public.alivedestiny_signals;
create policy "alivedestiny_signals: anon reads" on public.alivedestiny_signals
  for select to anon using (true);

-- Append-only, same reasoning and shape as 0003_signals_append_only.sql:
-- a trigger is not bypassed by BYPASSRLS, so this closes rewriting for
-- every role including service_role, the key the scheduled job uses.
create or replace function public.alivedestiny_signals_are_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'public.alivedestiny_signals is append-only: % rejected on signal id %', tg_op, old.id
    using hint = 'A correction is a new setup''s own signal, never an edit to this one.';
end;
$$;

drop trigger if exists alivedestiny_signals_no_rewrite on public.alivedestiny_signals;
create trigger alivedestiny_signals_no_rewrite
  before update or delete on public.alivedestiny_signals
  for each row execute function public.alivedestiny_signals_are_append_only();

create table if not exists public.alivedestiny_setups (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  timeframe text not null,
  strategy_version text not null,
  bos_candle_time timestamptz not null,
  bos_kind text not null check (bos_kind in ('BOS', 'CHoCH')),
  bos_direction integer not null check (bos_direction in (-1, 1)),
  bos_price double precision not null,
  break_strength text check (break_strength in ('STRONG', 'NORMAL', 'WEAK')),
  state text not null default 'BOS_DETECTED' check (state in (
    'BOS_DETECTED', 'IMPULSE_VALID', 'AWAITING_RETRACEMENT',
    'RETEST_PENDING', 'AWAITING_CONFIRMATION',
    'PUBLISHED', 'INVALIDATED', 'EXPIRED'
  )),
  impulse_start_price double precision,
  impulse_end_price double precision,
  impulse_atr_multiple double precision,
  fib_50 double precision,
  fib_61_8 double precision,
  fib_72 double precision,
  fib_78_6 double precision,
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invalidation_reason text,
  unique (symbol, timeframe, strategy_version, bos_candle_time)
);

comment on table public.alivedestiny_setups is
  'A candidate ALIVEDESTINY setup, tracked from Break-of-Structure detection through publish/invalidation/expiry — re-evaluated every scheduled run by src/run.py::advance_alivedestiny_setups(). Multiple concurrent open setups per (symbol, timeframe) are expected, not a bug — each is independent evidence.';
comment on column public.alivedestiny_setups.entered_at is
  'When the CURRENT state began — distinct from updated_at, which is bumped on every re-check even when the state does not change.';

create index if not exists alivedestiny_setups_open_idx on public.alivedestiny_setups (symbol, timeframe, state)
  where state not in ('PUBLISHED', 'INVALIDATED', 'EXPIRED');

alter table public.alivedestiny_setups enable row level security;

drop policy if exists "alivedestiny_setups: authenticated reads" on public.alivedestiny_setups;
create policy "alivedestiny_setups: authenticated reads" on public.alivedestiny_setups
  for select to authenticated using (true);

drop policy if exists "alivedestiny_setups: anon reads" on public.alivedestiny_setups;
create policy "alivedestiny_setups: anon reads" on public.alivedestiny_setups
  for select to anon using (true);

create table if not exists public.alivedestiny_setup_transitions (
  setup_id uuid not null references public.alivedestiny_setups (id),
  from_state text not null,
  to_state text not null,
  price double precision,
  transitioned_at timestamptz not null default now(),
  primary key (setup_id, transitioned_at)
);

comment on table public.alivedestiny_setup_transitions is
  'Append-only log of alivedestiny_setups state CHANGES only (not every re-check) — when a tracked setup actually moved from one state to another.';

alter table public.alivedestiny_setup_transitions enable row level security;

drop policy if exists "alivedestiny_setup_transitions: authenticated reads" on public.alivedestiny_setup_transitions;
create policy "alivedestiny_setup_transitions: authenticated reads" on public.alivedestiny_setup_transitions
  for select to authenticated using (true);

drop policy if exists "alivedestiny_setup_transitions: anon reads" on public.alivedestiny_setup_transitions;
create policy "alivedestiny_setup_transitions: anon reads" on public.alivedestiny_setup_transitions
  for select to anon using (true);
