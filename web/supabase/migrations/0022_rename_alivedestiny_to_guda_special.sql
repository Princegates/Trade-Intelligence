-- Trade Intelligence: rename the ALIVEDESTINY strategy to GUDA SPECIAL.
-- Purely a naming change — no logic, no data, no RLS-audience change.
-- Renames every object 0020_alivedestiny_setups.sql / 0021_alivedestiny_settings.sql
-- created: the 4 tables, the 1 partial index, the append-only trigger and
-- its function, the 10 named CHECK constraints on the settings table, and
-- the 8 RLS policies across the 4 tables. Table/column data, foreign keys,
-- and RLS itself are untouched by any of this — a rename tracks by OID,
-- not by name.
--
-- 0020/0021 are intentionally left unedited — they're the historical
-- record of what was actually applied, same "never edit a shipped
-- migration" convention every later settings addition in this project
-- (e.g. 0017, 0019) already followed by adding a new file instead.
--
-- Safe to re-run: the whole rename block only fires if the OLD table name
-- (alivedestiny_signals) still exists, so a second run of this file is a
-- no-op.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'alivedestiny_signals'
  ) then
    alter table public.alivedestiny_signals rename to guda_special_signals;
    alter table public.alivedestiny_setups rename to guda_special_setups;
    alter table public.alivedestiny_setup_transitions rename to guda_special_setup_transitions;
    alter table public.alivedestiny_settings rename to guda_special_settings;

    alter index public.alivedestiny_setups_open_idx rename to guda_special_setups_open_idx;

    -- Renaming the function updates the trigger's reference automatically
    -- (tracked by OID) — the trigger object itself is renamed separately
    -- purely for readability.
    alter function public.alivedestiny_signals_are_append_only() rename to guda_special_signals_are_append_only;
    alter trigger alivedestiny_signals_no_rewrite on public.guda_special_signals rename to guda_special_signals_no_rewrite;

    alter table public.guda_special_settings rename constraint alivedestiny_settings_is_singleton to guda_special_settings_is_singleton;
    alter table public.guda_special_settings rename constraint alivedestiny_settings_swing_lookback_positive to guda_special_settings_swing_lookback_positive;
    alter table public.guda_special_settings rename constraint alivedestiny_settings_min_impulse_atr_multiple_positive to guda_special_settings_min_impulse_atr_multiple_positive;
    alter table public.guda_special_settings rename constraint alivedestiny_settings_fib_zone_ordered to guda_special_settings_fib_zone_ordered;
    alter table public.guda_special_settings rename constraint alivedestiny_settings_structural_stop_buffer_atr_positive to guda_special_settings_structural_stop_buffer_atr_positive;
    alter table public.guda_special_settings rename constraint alivedestiny_settings_stop_distance_ordered to guda_special_settings_stop_distance_ordered;
    alter table public.guda_special_settings rename constraint alivedestiny_settings_reward_to_risk_positive to guda_special_settings_reward_to_risk_positive;
    alter table public.guda_special_settings rename constraint alivedestiny_settings_min_reward_to_risk_positive to guda_special_settings_min_reward_to_risk_positive;
    alter table public.guda_special_settings rename constraint alivedestiny_settings_max_entry_extension_atr_positive to guda_special_settings_max_entry_extension_atr_positive;
    alter table public.guda_special_settings rename constraint alivedestiny_settings_setup_expiry_candles_positive to guda_special_settings_setup_expiry_candles_positive;

    alter policy "alivedestiny_signals: authenticated reads" on public.guda_special_signals rename to "guda_special_signals: authenticated reads";
    alter policy "alivedestiny_signals: anon reads" on public.guda_special_signals rename to "guda_special_signals: anon reads";
    alter policy "alivedestiny_setups: authenticated reads" on public.guda_special_setups rename to "guda_special_setups: authenticated reads";
    alter policy "alivedestiny_setups: anon reads" on public.guda_special_setups rename to "guda_special_setups: anon reads";
    alter policy "alivedestiny_setup_transitions: authenticated reads" on public.guda_special_setup_transitions rename to "guda_special_setup_transitions: authenticated reads";
    alter policy "alivedestiny_setup_transitions: anon reads" on public.guda_special_setup_transitions rename to "guda_special_setup_transitions: anon reads";
    alter policy "alivedestiny_settings: anyone reads" on public.guda_special_settings rename to "guda_special_settings: anyone reads";
    alter policy "alivedestiny_settings: admins write" on public.guda_special_settings rename to "guda_special_settings: admins write";
  end if;
end $$;

-- Re-point the append-only trigger function's own error text at the new
-- table name. Idempotent on its own (create or replace), independent of
-- whether the guarded block above just ran or already ran previously.
create or replace function public.guda_special_signals_are_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'public.guda_special_signals is append-only: % rejected on signal id %', tg_op, old.id
    using hint = 'A correction is a new setup''s own signal, never an edit to this one.';
end;
$$;

-- Comments are naturally idempotent (comment on ... is ...) — always safe
-- to re-issue regardless of whether the rename block above fired.
comment on table public.guda_special_signals is
  'GUDA SPECIAL''s published output — BUY/SELL or a structured NO_TRADE — one row per resolved setup. See src/signals/setups.py.';
comment on column public.guda_special_signals.confidence_score is
  'Diagnostic 0-100 quality read, never a gate substitute — populated in a later phase, NULL here.';

comment on table public.guda_special_setups is
  'A candidate GUDA SPECIAL setup, tracked from Break-of-Structure detection through publish/invalidation/expiry — re-evaluated every scheduled run by src/run.py::advance_guda_special_setups(). Multiple concurrent open setups per (symbol, timeframe) are expected, not a bug — each is independent evidence.';
comment on column public.guda_special_setups.entered_at is
  'When the CURRENT state began — distinct from updated_at, which is bumped on every re-check even when the state does not change.';

comment on table public.guda_special_setup_transitions is
  'Append-only log of guda_special_setups state CHANGES only (not every re-check) — when a tracked setup actually moved from one state to another.';

comment on table public.guda_special_settings is
  'Admin-configurable thresholds for the GUDA SPECIAL strategy — see src/signals/setups.py and src/storage/supabase.py::get_guda_special_settings().';
comment on column public.guda_special_settings.htf_filter_mode is
  '"advisory"/"downgrade" never block a setup on 1H conflict (noted only); "strict_veto" rejects it outright. See src/signals/htf_filter.py.';
comment on column public.guda_special_settings.target_conflict_policy is
  'What to do when a confirmed swing sits between entry and target: "ignore" it, "downgrade" (publish anyway, flagged), or "reject" the setup outright.';
