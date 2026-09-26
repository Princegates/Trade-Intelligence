-- Trade Intelligence: access codes expire a fixed number of days after
-- they're generated — independent of how long access lasts once redeemed.
-- Site-wide setting (same singleton pattern as access_policy.trial_days),
-- not a per-code input at generation time. Distinct from trial_days: that
-- controls how long *access* lasts once a code is redeemed; this controls
-- how long the *code* stays redeemable before the admin has to generate a
-- new one.
--
-- Existing unredeemed codes get expires_at = null, treated by
-- redeem_access_code() below as never-expiring (they predate this feature).
--
-- Safe to re-run.

alter table public.access_policy
  add column if not exists code_expiry_days integer not null default 3
    constraint access_policy_code_expiry_days_positive check (code_expiry_days > 0);

alter table public.access_codes
  add column if not exists expires_at timestamptz;

-- Re-declare with one added guard: expires_at in the past excludes the code,
-- same as an already-redeemed one. Boundary matches hasFullAccess's
-- `expiry > now` convention (src/lib/access.ts) — valid means
-- expires_at is null or expires_at > now().
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
  where code = p_code
    and user_id = v_user_id
    and redeemed_at is null
    and (expires_at is null or expires_at > now())
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
