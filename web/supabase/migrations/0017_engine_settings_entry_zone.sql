-- Trade Intelligence: Phase 2a entry-zone/structural-stop settings, added
-- to the existing engine_settings singleton (0014_engine_settings.sql).
--
-- structure_buffer_atr/entry_zone_width_atr are always-on defaults (no
-- settings row needed for the feature itself to work — see
-- src/signals/engine.py's STRUCTURE_BUFFER_ATR/ENTRY_ZONE_WIDTH_ATR
-- module constants) but are admin-adjustable here the same way every
-- other threshold in this table is. max_entry_zone_distance_atr is the one
-- genuinely new decision surface: like min_confidence_threshold
-- (0014_engine_settings.sql), it is NOT NULL with a real default, so the
-- gate starts working the moment this migration is applied rather than
-- waiting for an admin to opt in — 1.5 ATR sits between the existing
-- confidence formula's own 1.0/2.0 ATR distance bands (src/signals/
-- engine.py::_pullback_quality_score), not an arbitrary number.
--
-- Safe to re-run.

alter table public.engine_settings
  add column if not exists structure_buffer_atr double precision not null default 0.25;
alter table public.engine_settings
  add column if not exists entry_zone_width_atr double precision not null default 0.5;
alter table public.engine_settings
  add column if not exists max_entry_zone_distance_atr double precision not null default 1.5;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS for CHECK constraints, so
-- drop-then-add is what makes this safe to re-run (same shape as 0014's
-- drop-policy-then-create-policy below).
alter table public.engine_settings drop constraint if exists engine_settings_structure_buffer_atr_positive;
alter table public.engine_settings
  add constraint engine_settings_structure_buffer_atr_positive check (structure_buffer_atr > 0);
alter table public.engine_settings drop constraint if exists engine_settings_entry_zone_width_atr_positive;
alter table public.engine_settings
  add constraint engine_settings_entry_zone_width_atr_positive check (entry_zone_width_atr > 0);
alter table public.engine_settings drop constraint if exists engine_settings_max_entry_zone_distance_atr_positive;
alter table public.engine_settings
  add constraint engine_settings_max_entry_zone_distance_atr_positive check (max_entry_zone_distance_atr > 0);

comment on column public.engine_settings.structure_buffer_atr is
  'ATR fraction buffering a structural stop beyond its swing level (src/signals/entry_zone.py::structural_stop()).';
comment on column public.engine_settings.entry_zone_width_atr is
  'Half-width, in ATRs, of the preferred-entry band around a structural level (src/signals/entry_zone.py::entry_zone()).';
comment on column public.engine_settings.max_entry_zone_distance_atr is
  'A directional call whose price has run more than this many ATRs from its own entry zone is overridden to HOLD (src/signals/entry_zone.py::distance_exceeds()) — live by default, same as min_confidence_threshold, not opt-in.';
