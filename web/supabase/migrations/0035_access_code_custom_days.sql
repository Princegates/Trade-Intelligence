-- Trade Intelligence: lets an admin choose how many days of full access a
-- specific code grants, per person, instead of every code always using the
-- site-wide access_policy.trial_days.
--
-- Nullable by design: existing unredeemed codes (issued before this shipped)
-- have no access_days and keep falling back to the site default exactly as
-- they already did — this only changes behavior for codes generated after
-- src/lib/actions/users.ts#generateAccessCode starts passing a value.
--
-- Safe to re-run.

alter table public.access_codes
  add column if not exists access_days integer
    constraint access_codes_access_days_positive check (access_days > 0);

-- Re-declare with one added fallback: a code's own access_days wins over
-- the site-wide trial_days when set, same precedence order the comment on
-- the column above describes.
create or replace function public.redeem_access_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code_id uuid;
  v_access_days integer;
  v_trial_days integer;
  v_current_until timestamptz;
begin
  if v_user_id is null then
    return false;
  end if;

  select id, access_days into v_code_id, v_access_days
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
  set full_access_until = greatest(now(), coalesce(v_current_until, now())) + make_interval(days => coalesce(v_access_days, v_trial_days, 7))
  where id = v_user_id;

  return true;
end;
$$;

grant execute on function public.redeem_access_code(text) to authenticated;
