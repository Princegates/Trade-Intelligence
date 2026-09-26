-- Trade Intelligence: admin-configurable entry-quality thresholds for the
-- Python signal engine (src/signals/engine.py, STRATEGY_VERSION 3.0.0+).
--
-- Same singleton pattern as access_policy (0011_trial_access.sql) — one
-- row, plain typed columns, read by anyone (the Python cron reads it with
-- the service-role key, same as app_settings), written only by admins.
-- Deliberately NOT modeled as an app_settings category/provider row: these
-- are site-wide scalar knobs read by every run, not per-provider
-- credentials, and app_settings' category CHECK constraint and
-- (category, provider) unique key are built for the latter.
--
-- Every field has a default that reproduces the engine's pre-3.0.0 fixed
-- behavior (atr_stop_multiplier/reward_to_risk match the old STOP_ATRS/
-- REWARD_TO_RISK constants; min_reward_to_risk defaults equal to
-- reward_to_risk so the R:R gate is real but inert out of the box;
-- min_confidence_threshold matches the spec's own suggested "below 65 =
-- no trade" default) — so the first time this row exists, the live system
-- starts gating on it immediately. That's intentional, not an oversight:
-- see src/signals/engine.py's module docstring on the confidence score for
-- why, and lower/raise these from the admin UI if that's not the behavior
-- wanted.
--
-- Safe to re-run.

create table if not exists public.engine_settings (
  id boolean primary key default true,
  atr_stop_multiplier double precision not null default 0.75,
  reward_to_risk double precision not null default 1.5,
  min_reward_to_risk double precision not null default 1.5,
  min_confidence_threshold double precision not null default 65,
  confidence_high_threshold double precision not null default 75,
  confidence_very_high_threshold double precision not null default 85,
  require_higher_timeframe_confluence boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint engine_settings_is_singleton check (id),
  constraint engine_settings_atr_stop_multiplier_positive check (atr_stop_multiplier > 0),
  constraint engine_settings_reward_to_risk_positive check (reward_to_risk > 0),
  constraint engine_settings_min_reward_to_risk_positive check (min_reward_to_risk > 0),
  constraint engine_settings_confidence_thresholds_ordered check (
    min_confidence_threshold >= 0
    and min_confidence_threshold < confidence_high_threshold
    and confidence_high_threshold < confidence_very_high_threshold
    and confidence_very_high_threshold <= 100
  )
);

insert into public.engine_settings (id) values (true)
  on conflict (id) do nothing;

alter table public.engine_settings enable row level security;

drop policy if exists "engine_settings: anyone reads" on public.engine_settings;
create policy "engine_settings: anyone reads" on public.engine_settings
  for select using (true);

drop policy if exists "engine_settings: admins write" on public.engine_settings;
create policy "engine_settings: admins write" on public.engine_settings
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

comment on table public.engine_settings is
  'Admin-configurable entry-quality thresholds for the Python signal engine — see src/signals/engine.py and src/storage/supabase.py::get_engine_settings().';
comment on column public.engine_settings.min_reward_to_risk is
  'Directional calls with a computed risk/reward below this are overridden to HOLD. No cross-constraint against reward_to_risk: setting this above reward_to_risk deliberately suppresses every directional signal, matching the spec''s literal "reject setups where the reward does not justify the risk" intent.';
comment on column public.engine_settings.min_confidence_threshold is
  'Directional calls scoring below this (out of 100) are overridden to HOLD. The confidence score is a transparent read of how much of the engine''s own evidence agrees with itself, not a calibrated win probability — see src/signals/engine.py.';
