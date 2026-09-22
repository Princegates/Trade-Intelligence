-- Trade Intelligence: price levels and candlestick evidence.
--
-- A verdict on its own is not actionable — "BUY" does not say where to get
-- out if it is wrong. These carry the levels the engine sized from ATR, so a
-- call arrives with its own invalidation (FR-SIG-002, SE-006).
--
-- For a BUY or SELL: entry, stop (invalidation) and target.
-- For a HOLD: buy_above / sell_below, the prices that would end the wait.
-- The unused pair is null rather than zero — zero is a price.
--
-- Safe to re-run.

alter table public.signals
  add column if not exists patterns text not null default '',
  add column if not exists entry double precision,
  add column if not exists stop double precision,
  add column if not exists target double precision,
  add column if not exists buy_above double precision,
  add column if not exists sell_below double precision;

comment on column public.signals.patterns is
  'Candlestick patterns detected on the signal candle, read in trend context.';
comment on column public.signals.entry is
  'Reference price for a directional call; null on a HOLD.';
comment on column public.signals.stop is
  'Invalidation level — where the call is wrong; null on a HOLD.';
comment on column public.signals.buy_above is
  'On a HOLD, the price above which this becomes a buy; null otherwise.';
comment on column public.signals.sell_below is
  'On a HOLD, the price below which this becomes a sell; null otherwise.';
