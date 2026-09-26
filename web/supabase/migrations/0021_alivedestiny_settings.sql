-- Trade Intelligence: admin-configurable thresholds for ALIVEDESTINY
-- (src/signals/setups.py), a new singleton mirroring engine_settings'
-- own pattern (0014_engine_settings.sql) exactly — one row, plain typed
-- columns, read by anyone, written only by admins.
--
-- A NEW table rather than more columns on engine_settings: that table is
-- framed, in its own migration comment, as "read by every run" of the
-- confluence engine specifically. ALIVEDESTINY's ~14 settings are read
-- only by its own passes and would be dead weight on every confluence-
-- engine evaluation, and vice versa — a distinct decision surface
-- deserves its own row, same reasoning engine_settings itself was split
-- out from app_settings for.
--
-- Every default reproduces src/signals/setups.py's own hardcoded
-- fallbacks (settings.get(key, DEFAULT)), so a missing/unreachable table
-- degrades every gate to the same behavior this migration's defaults
-- give a fresh row — the live system starts gating on real thresholds
-- immediately once this row exists, same as every prior settings table.
--
-- Safe to re-run.

create table if not exists public.alivedestiny_settings (
  id boolean primary key default true,
  swing_lookback integer not null default 2,
  min_impulse_atr_multiple double precision not null default 1.5,
  fib_valid_min double precision not null default 0.5,
  fib_valid_max double precision not null default 0.786,
  fib_deep_max double precision not null default 0.886,
  structural_stop_buffer_atr double precision not null default 0.25,
  max_stop_distance_atr double precision not null default 3.0,
  min_stop_distance_atr double precision not null default 0.3,
  reward_to_risk double precision not null default 2.0,
  min_reward_to_risk double precision not null default 1.8,
  max_entry_extension_atr double precision not null default 0.75,
  setup_expiry_candles integer not null default 20,
  htf_filter_mode text not null default 'downgrade'
    check (htf_filter_mode in ('advisory', 'downgrade', 'strict_veto')),
  target_conflict_policy text not null default 'downgrade'
    check (target_conflict_policy in ('ignore', 'downgrade', 'reject')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint alivedestiny_settings_is_singleton check (id),
  constraint alivedestiny_settings_swing_lookback_positive check (swing_lookback > 0),
  constraint alivedestiny_settings_min_impulse_atr_multiple_positive check (min_impulse_atr_multiple > 0),
  constraint alivedestiny_settings_fib_zone_ordered check (
    fib_valid_min >= 0 and fib_valid_min < fib_valid_max
    and fib_valid_max < fib_deep_max and fib_deep_max <= 1
  ),
  constraint alivedestiny_settings_structural_stop_buffer_atr_positive check (structural_stop_buffer_atr > 0),
  constraint alivedestiny_settings_stop_distance_ordered check (
    min_stop_distance_atr > 0 and min_stop_distance_atr < max_stop_distance_atr
  ),
  constraint alivedestiny_settings_reward_to_risk_positive check (reward_to_risk > 0),
  constraint alivedestiny_settings_min_reward_to_risk_positive check (min_reward_to_risk > 0),
  constraint alivedestiny_settings_max_entry_extension_atr_positive check (max_entry_extension_atr > 0),
  constraint alivedestiny_settings_setup_expiry_candles_positive check (setup_expiry_candles > 0)
);

insert into public.alivedestiny_settings (id) values (true)
  on conflict (id) do nothing;

alter table public.alivedestiny_settings enable row level security;

drop policy if exists "alivedestiny_settings: anyone reads" on public.alivedestiny_settings;
create policy "alivedestiny_settings: anyone reads" on public.alivedestiny_settings
  for select using (true);

drop policy if exists "alivedestiny_settings: admins write" on public.alivedestiny_settings;
create policy "alivedestiny_settings: admins write" on public.alivedestiny_settings
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

comment on table public.alivedestiny_settings is
  'Admin-configurable thresholds for the ALIVEDESTINY strategy — see src/signals/setups.py and src/storage/supabase.py::get_alivedestiny_settings().';
comment on column public.alivedestiny_settings.htf_filter_mode is
  '"advisory"/"downgrade" never block a setup on 1H conflict (noted only); "strict_veto" rejects it outright. See src/signals/htf_filter.py.';
comment on column public.alivedestiny_settings.target_conflict_policy is
  'What to do when a confirmed swing sits between entry and target: "ignore" it, "downgrade" (publish anyway, flagged), or "reject" the setup outright.';
