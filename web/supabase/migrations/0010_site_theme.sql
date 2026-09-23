-- Trade Intelligence: one site-wide theme, admin-controlled.
--
-- The theme picker used to be a per-visitor preference stored in a cookie.
-- Per product decision, only an admin chooses the theme now (from
-- /admin/appearance), and it applies to every visitor — logged in or not,
-- approved or not, since the public marketing pages need it too.
--
-- Single-row table: id is always `true`, enforced by the primary key and
-- the check constraint together rather than a separate singleton
-- mechanism.
--
-- Safe to re-run.

create table if not exists public.site_appearance (
  id boolean primary key default true,
  theme text not null default 'default',
  mode text not null default 'light',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint site_appearance_is_singleton check (id)
);

insert into public.site_appearance (id) values (true)
  on conflict (id) do nothing;

alter table public.site_appearance enable row level security;

-- No CHECK on `theme`/`mode` values here on purpose (same reasoning as
-- signal_suppressions.reason in 0002): the app validates against its own
-- theme list (src/lib/themes.ts) before writing, so adding a theme never
-- needs a migration.

drop policy if exists "site_appearance: anyone reads" on public.site_appearance;
create policy "site_appearance: anyone reads" on public.site_appearance
  for select using (true);

drop policy if exists "site_appearance: admins write" on public.site_appearance;
create policy "site_appearance: admins write" on public.site_appearance
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
