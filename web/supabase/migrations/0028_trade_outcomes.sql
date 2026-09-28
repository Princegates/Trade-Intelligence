-- Trade Intelligence: honest outcome tracking.
--
-- trade_outcomes — every BUY/SELL from the confluence engine and GUDA
-- SPECIAL, followed candle by candle until its stop or target is hit (or it
-- times out), scored in R after trading costs. Written by the engine
-- (src/run.py) with the service-role key using src/trade_sim.py's rules:
-- entry at the signal candle's close; each later candle checked by its high
-- and low; a candle touching both stop and target counts as the stop; a gap
-- past the stop fills at the open; one open position per strategy, market
-- and timeframe (a signal while one is open is not tracked).
--
-- This replaces signal_lifecycle's CONFIRMED/INVALIDATED as the measure of
-- how calls actually did: that one counts a close 1R in profit as a win and
-- only sees the newest candle's close, so it overstates results.
-- signal_lifecycle stays as is — it still drives the WAIT/WATCH/READY
-- status on the dashboard cards.
--
-- backtest_runs — one row per timeframe per run of src/backtest.py (the
-- "Backtest" GitHub Actions workflow), scored with the same rules.
--
-- Admin-only read for now (/admin/performance); nothing is public until
-- there's enough history to say something true.
--
-- Safe to re-run.

create table if not exists public.trade_outcomes (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('confluence', 'guda_special')),
  symbol text not null,
  timeframe text not null,
  strategy_version text not null,
  signal_time timestamptz not null,
  direction smallint not null check (direction in (-1, 1)),
  entry double precision not null,
  stop double precision not null,
  target double precision not null,
  confidence double precision,
  cost_pct double precision not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'TARGET', 'STOP', 'TIMEOUT')),
  bars integer not null default 0,
  last_candle_time timestamptz not null,
  mfe_r double precision not null default 0,
  mae_r double precision not null default 0,
  exit_price double precision,
  exit_time timestamptz,
  r_gross double precision,
  r_cost double precision not null,
  r_net double precision,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, symbol, timeframe, strategy_version, signal_time)
);

create index if not exists trade_outcomes_open_idx on public.trade_outcomes (source, symbol, timeframe)
  where status = 'OPEN';
create index if not exists trade_outcomes_exit_idx on public.trade_outcomes (exit_time desc);

alter table public.trade_outcomes enable row level security;

drop policy if exists "trade_outcomes: admins read" on public.trade_outcomes;
create policy "trade_outcomes: admins read" on public.trade_outcomes
  for select using (public.is_admin(auth.uid()));

create table if not exists public.backtest_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  strategy text not null check (strategy in ('confluence', 'guda_special')),
  strategy_version text not null,
  symbol text not null,
  timeframe text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  candles integer not null,
  signals integer not null,
  skipped integer not null,
  cost_pct double precision not null,
  settings jsonb not null default '{}'::jsonb,
  trades integer not null,
  open_trades integer not null,
  wins integer not null,
  win_rate double precision,
  avg_r_net double precision,
  avg_r_gross double precision,
  avg_cost_r double precision,
  total_r_net double precision not null,
  profit_factor double precision,
  max_drawdown_r double precision not null,
  worst_losing_streak integer not null,
  avg_bars double precision,
  target_rate double precision,
  stop_rate double precision,
  timeout_rate double precision
);

create index if not exists backtest_runs_latest_idx
  on public.backtest_runs (strategy, symbol, timeframe, created_at desc);

alter table public.backtest_runs enable row level security;

drop policy if exists "backtest_runs: admins read" on public.backtest_runs;
create policy "backtest_runs: admins read" on public.backtest_runs
  for select using (public.is_admin(auth.uid()));
