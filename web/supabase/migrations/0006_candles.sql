-- Trade Intelligence: candles for the chart.
--
-- The engine's canonical candles, mirrored up so the browser can draw them.
-- Deliberately not fetched client-side from the exchange: a chart drawn from
-- a different source than the signals will eventually disagree with them, and
-- it would bypass the quality gates every stored candle has already passed.
--
-- Only closed candles are mirrored. The forming one is excluded for the same
-- reason the indicators ignore it — its body and wicks are still moving.
--
-- Safe to re-run.

create table if not exists public.candles (
  symbol text not null,
  timeframe text not null,
  open_time timestamptz not null,
  open double precision not null,
  high double precision not null,
  low double precision not null,
  close double precision not null,
  volume double precision not null,
  primary key (symbol, timeframe, open_time)
);

alter table public.candles enable row level security;

drop policy if exists "candles: authenticated users read" on public.candles;
create policy "candles: authenticated users read" on public.candles
  for select using (auth.role() = 'authenticated');

-- Writes come from the cron job's service key, which bypasses RLS; no
-- client-facing role is granted insert or update.

-- Newest-first per instrument is the only access pattern the chart has.
create index if not exists candles_series_idx
  on public.candles (symbol, timeframe, open_time desc);

-- Let the chart receive new candles without a reload, as 0004 did for signals.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'candles'
  ) then
    alter publication supabase_realtime add table public.candles;
  end if;
end $$;
