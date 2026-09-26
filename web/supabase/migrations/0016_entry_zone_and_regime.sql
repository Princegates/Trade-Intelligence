-- Trade Intelligence: structure-aware stop/target invalidation and market
-- regime/phase, Phase 2a of the entry-quality engine (src/signals/
-- entry_zone.py, STRATEGY_VERSION 3.1.0+).
--
-- Nullable and additive, same pattern as 0005_levels_and_patterns.sql and
-- 0015_signal_confluence.sql — existing rows simply have no value here.
--
-- regime/market_phase populate on every signal, including HOLD (they
-- describe the market, not any one call). invalidation_level/
-- entry_zone_low/entry_zone_high are null on HOLD, matching the existing
-- entry/stop/target null-for-HOLD contract — there is no live call for
-- them to describe.
--
-- Safe to re-run.

alter table public.signals add column if not exists regime text;
alter table public.signals add column if not exists market_phase text;
alter table public.signals add column if not exists invalidation_level double precision;
alter table public.signals add column if not exists entry_zone_low double precision;
alter table public.signals add column if not exists entry_zone_high double precision;

comment on column public.signals.regime is
  'TRENDING/RANGING/REVERSING at signal time (src/signals/structure.py::regime()); populated regardless of verdict, including HOLD.';
comment on column public.signals.market_phase is
  'IMPULSE/PULLBACK/CONSOLIDATION/BREAKOUT/REVERSAL (src/signals/entry_zone.py::market_phase()); populated regardless of verdict, including HOLD.';
comment on column public.signals.invalidation_level is
  'The raw structural support/resistance level whose breach means this call''s thesis was wrong (src/signals/entry_zone.py::invalidation_level()); null on HOLD or when no structural level was available yet.';
comment on column public.signals.entry_zone_low is
  'Lower bound of the preferred-entry band around the nearest structural level (src/signals/entry_zone.py::entry_zone()); null on HOLD or when unavailable.';
comment on column public.signals.entry_zone_high is
  'Upper bound of the preferred-entry band around the nearest structural level (src/signals/entry_zone.py::entry_zone()); null on HOLD or when unavailable.';
