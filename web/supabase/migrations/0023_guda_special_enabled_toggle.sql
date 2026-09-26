-- Trade Intelligence: admin on/off switch for whether the GUDA SPECIAL
-- signal card is shown to users on the dashboard. Pure display gate — the
-- Python pipeline (src/signals/setups.py, wired via src/run.py) keeps
-- detecting setups and publishing to guda_special_signals regardless of
-- this column's value; only web/ reads it.
--
-- Defaults to false: the feature isn't announced yet, so it stays hidden
-- from every user until an admin visits /admin/settings and turns it on.
--
-- Safe to re-run.

alter table public.guda_special_settings
  add column if not exists enabled boolean not null default false;

comment on column public.guda_special_settings.enabled is
  'Whether the GUDA SPECIAL signal card is shown to users on the dashboard. The strategy keeps running and publishing in the background either way — this is a display gate only. See web/src/lib/guda-special-settings.ts.';
