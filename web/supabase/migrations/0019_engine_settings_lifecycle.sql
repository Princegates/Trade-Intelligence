-- Trade Intelligence: Phase 2b lifecycle thresholds, added to the existing
-- engine_settings singleton (0014_engine_settings.sql).
--
-- All three are NOT NULL with a real default, live from the moment this
-- migration is applied — same "admin-adjustable, not opt-in" pattern
-- 0014/0017 already established, not a feature flag.
--
-- Safe to re-run.

alter table public.engine_settings
  add column if not exists lifecycle_watch_zone_half_widths double precision not null default 2.0;
alter table public.engine_settings
  add column if not exists lifecycle_confirm_move_r double precision not null default 1.0;
alter table public.engine_settings
  add column if not exists lifecycle_expiry_candles integer not null default 20;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS for CHECK constraints, so
-- drop-then-add is what makes this safe to re-run (same shape as 0017).
alter table public.engine_settings drop constraint if exists engine_settings_lifecycle_watch_zone_half_widths_positive;
alter table public.engine_settings
  add constraint engine_settings_lifecycle_watch_zone_half_widths_positive check (lifecycle_watch_zone_half_widths > 0);
alter table public.engine_settings drop constraint if exists engine_settings_lifecycle_confirm_move_r_positive;
alter table public.engine_settings
  add constraint engine_settings_lifecycle_confirm_move_r_positive check (lifecycle_confirm_move_r > 0);
alter table public.engine_settings drop constraint if exists engine_settings_lifecycle_expiry_candles_positive;
alter table public.engine_settings
  add constraint engine_settings_lifecycle_expiry_candles_positive check (lifecycle_expiry_candles > 0);

comment on column public.engine_settings.lifecycle_watch_zone_half_widths is
  'How many entry-zone half-widths away from its own zone a tracked signal counts as WATCH rather than WAIT (src/signals/lifecycle.py::next_state()).';
comment on column public.engine_settings.lifecycle_confirm_move_r is
  'How many risk-units (multiples of abs(entry-stop)) a favorable move needs before a signal is CONFIRMED (src/signals/lifecycle.py::next_state()).';
comment on column public.engine_settings.lifecycle_expiry_candles is
  'How many candles of a signal''s own timeframe can pass with no resolution before it is marked EXPIRED (src/signals/lifecycle.py::next_state()).';
