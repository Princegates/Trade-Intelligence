-- Trade Intelligence: admin on/off switch for showing each timeframe's live
-- results ("last 30 trades: win rate, average R") on the users' dashboard
-- signal cards. Pure display gate — the engine tracks every call in
-- trade_outcomes (0028) either way; only web/ reads this.
--
-- Users only ever receive the summary numbers, computed server-side;
-- trade_outcomes itself stays admin-only.
--
-- Defaults to false, like GUDA SPECIAL's switch: hidden until an admin
-- turns it on at /admin/settings.
--
-- Safe to re-run.

create table if not exists public.live_results_settings (
  id boolean primary key default true,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint live_results_settings_is_singleton check (id)
);

insert into public.live_results_settings (id) values (true)
  on conflict (id) do nothing;

alter table public.live_results_settings enable row level security;

drop policy if exists "live_results_settings: anyone reads" on public.live_results_settings;
create policy "live_results_settings: anyone reads" on public.live_results_settings
  for select using (true);

drop policy if exists "live_results_settings: admins update" on public.live_results_settings;
create policy "live_results_settings: admins update" on public.live_results_settings
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
