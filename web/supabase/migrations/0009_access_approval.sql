-- Trade Intelligence: admin-approved access.
--
-- New accounts can still sign up freely, but a fresh profile starts
-- unapproved — the dashboard and the data feeds that back it stay locked
-- until an admin confirms the account from /admin/users. This is
-- deliberately an application-layer gate first (src/lib/auth.ts#requireUser
-- redirects an unapproved user to /pending instead of the dashboard) and an
-- RLS gate second, for the tables that don't already have a public preview
-- carve-out.
--
-- signals is left alone here on purpose: 0008 already made it fully
-- readable by `anon`, so gating the `authenticated` policy on approval
-- would add nothing real — anyone, approved or not, logged in or not, can
-- already read every row directly. Tightening it would only look like a
-- fix. signal_suppressions, candles and economic_events never got that
-- carve-out, so those three are still worth gating properly.
--
-- Safe to re-run.

alter table public.profiles
  add column if not exists approved boolean not null default false;

comment on column public.profiles.approved is
  'Set by an admin from /admin/users. An unapproved, non-admin user is redirected '
  'away from the dashboard (src/lib/auth.ts#requireUser) and loses RLS read access '
  'to signal_suppressions, candles and economic_events.';

create or replace function public.has_access(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = uid and (approved or role = 'admin')
  );
$$;

-- Without this, a user could set their own `approved` to true the same way
-- `role` was self-escalatable before the equivalent fix was applied to it
-- in 0001 — the RLS policy on this table's own update didn't pin the new
-- `approved` column the way it already pinned `role`.
drop policy if exists "profiles: update own row (not role)" on public.profiles;
drop policy if exists "profiles: update own row (not role or approval)" on public.profiles;
create policy "profiles: update own row (not role or approval)" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
    and approved = (select approved from public.profiles where id = auth.uid())
  );

drop policy if exists "signal_suppressions: authenticated users read" on public.signal_suppressions;
create policy "signal_suppressions: approved users read" on public.signal_suppressions
  for select using (public.has_access(auth.uid()));

drop policy if exists "candles: authenticated users read" on public.candles;
create policy "candles: approved users read" on public.candles
  for select using (public.has_access(auth.uid()));

drop policy if exists "economic_events: authenticated users read" on public.economic_events;
create policy "economic_events: approved users read" on public.economic_events
  for select using (public.has_access(auth.uid()));
