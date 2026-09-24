-- Trade Intelligence: time-limited trial access + admin-issued unlock codes.
--
-- Every account still needs admin approval before it reaches the dashboard
-- at all (0009). This adds a second, later gate: once approved, an account
-- gets full access (every timeframe's full history) for a fixed trial
-- window. After that window closes it drops to the same "latest signal
-- only, no history" shape the public marketing preview already uses
-- (src/lib/signals.ts#getLatestSignals) — enforced in the app layer, not
-- RLS, because 0008 already made every `signals` row anon-readable by
-- design; there is no RLS wall left to add here without reversing that
-- decision, which this migration does not do.
--
-- To get back to full access, the admin generates a one-time code tied to
-- that specific person (/admin/users) and sends it to them out of band —
-- there is no in-app way to see or guess someone else's code. Redeeming it
-- extends their access by another trial-length window from whichever is
-- later: now, or their current expiry (so redeeming early doesn't waste the
-- days they still had).
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- access_policy: one site-wide setting, same singleton shape as
-- site_appearance (0010) — id is always `true`.
-- ---------------------------------------------------------------------------
create table if not exists public.access_policy (
  id boolean primary key default true,
  trial_days integer not null default 7,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint access_policy_is_singleton check (id),
  constraint access_policy_trial_days_positive check (trial_days > 0)
);

insert into public.access_policy (id) values (true)
  on conflict (id) do nothing;

alter table public.access_policy enable row level security;

drop policy if exists "access_policy: anyone reads" on public.access_policy;
create policy "access_policy: anyone reads" on public.access_policy
  for select using (true);

drop policy if exists "access_policy: admins write" on public.access_policy;
create policy "access_policy: admins write" on public.access_policy
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- profiles.full_access_until: null or in the past = basic view. Set by the
-- admin approval action (src/lib/actions/users.ts#setUserApproval) and
-- extended by redeem_access_code() below — never by the user directly.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists full_access_until timestamptz;

-- Same self-escalation hole 0009 closed for `approved`: without pinning this
-- column too, a user could set their own full_access_until to any future
-- date directly through the API, the same way `role`/`approved` were
-- self-escalatable before each got pinned in turn.
drop policy if exists "profiles: update own row (not role or approval)" on public.profiles;
drop policy if exists "profiles: update own row (not role, approval, or access)" on public.profiles;
create policy "profiles: update own row (not role, approval, or access)" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
    and approved = (select approved from public.profiles where id = auth.uid())
    and full_access_until is not distinct from (select full_access_until from public.profiles where id = auth.uid())
  );

-- Accounts already approved before this shipped keep working uninterrupted
-- instead of being silently dropped to basic view the moment this migration
-- runs — they get a fresh trial window starting now, same as a brand new
-- approval would grant.
update public.profiles
set full_access_until = now() + make_interval(days => (select trial_days from public.access_policy where id = true))
where approved and role <> 'admin' and full_access_until is null;

-- ---------------------------------------------------------------------------
-- access_codes: one-time, per-person unlock codes. Only an admin can create
-- or list them; redemption goes through redeem_access_code() below, a
-- security-definer function, rather than a direct-update RLS policy, so a
-- user can redeem their own code without ever being granted UPDATE on this
-- table (which would otherwise be one more thing to pin against misuse).
-- ---------------------------------------------------------------------------
create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create index if not exists access_codes_user_id_idx on public.access_codes (user_id);

alter table public.access_codes enable row level security;

drop policy if exists "access_codes: admins manage" on public.access_codes;
create policy "access_codes: admins manage" on public.access_codes
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- security definer: runs as the table owner, so it can update a row this
-- user has no direct UPDATE grant on — but it only ever touches auth.uid()'s
-- own code and own profile row, never an id the caller passes in, so it
-- can't be used to redeem someone else's code or extend someone else's
-- access.
create or replace function public.redeem_access_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code_id uuid;
  v_trial_days integer;
  v_current_until timestamptz;
begin
  if v_user_id is null then
    return false;
  end if;

  select id into v_code_id
  from public.access_codes
  where code = p_code and user_id = v_user_id and redeemed_at is null
  limit 1;

  if v_code_id is null then
    return false;
  end if;

  select trial_days into v_trial_days from public.access_policy where id = true;
  select full_access_until into v_current_until from public.profiles where id = v_user_id;

  update public.access_codes set redeemed_at = now() where id = v_code_id;

  update public.profiles
  set full_access_until = greatest(now(), coalesce(v_current_until, now())) + make_interval(days => coalesce(v_trial_days, 7))
  where id = v_user_id;

  return true;
end;
$$;

grant execute on function public.redeem_access_code(text) to authenticated;
