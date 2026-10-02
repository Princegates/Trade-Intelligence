-- Trade Intelligence: let an admin account actually be deleted, even after
-- it has touched settings other tables attribute to it.
--
-- Every updated_by/created_by column referencing profiles(id) was defined
-- with Postgres' implicit ON DELETE NO ACTION, which blocks deleting a
-- profile row (and therefore the auth.users row it cascades from —
-- 0001_init.sql's `on delete cascade` runs the other direction) for as
-- long as any row anywhere still names them as "who last changed this."
-- That's a real problem specifically for admin accounts, which are
-- exactly the ones likely to have saved a settings change at some point.
--
-- Relaxed to ON DELETE SET NULL throughout: who last changed a setting is
-- a historical fact worth keeping queryable, same "the log outlives the
-- account" reasoning activity_log.actor_id already follows deliberately
-- having no FK at all (0027_activity_log.sql) — this just stops being
-- able to name someone who no longer has an account, rather than
-- blocking the deletion entirely.
--
-- access_codes.user_id already cascades correctly (0011_trial_access.sql)
-- — deleting a user removes their own unredeemed/redeemed codes with
-- them, which is correct (they're meaningless without the account).
-- access_codes.created_by (who issued a code, possibly for someone else)
-- is NOT NULL today; dropped to nullable here so SET NULL can apply.
--
-- Safe to re-run — each block only acts if the old constraint is still
-- the one in place.

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'app_settings_updated_by_fkey' and confdeltype = 'a'
  ) then
    alter table public.app_settings drop constraint app_settings_updated_by_fkey;
    alter table public.app_settings
      add constraint app_settings_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'access_policy_updated_by_fkey' and confdeltype = 'a'
  ) then
    alter table public.access_policy drop constraint access_policy_updated_by_fkey;
    alter table public.access_policy
      add constraint access_policy_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'site_appearance_updated_by_fkey' and confdeltype = 'a'
  ) then
    alter table public.site_appearance drop constraint site_appearance_updated_by_fkey;
    alter table public.site_appearance
      add constraint site_appearance_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'engine_settings_updated_by_fkey' and confdeltype = 'a'
  ) then
    alter table public.engine_settings drop constraint engine_settings_updated_by_fkey;
    alter table public.engine_settings
      add constraint engine_settings_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'guda_special_settings_updated_by_fkey' and confdeltype = 'a'
  ) then
    alter table public.guda_special_settings drop constraint guda_special_settings_updated_by_fkey;
    alter table public.guda_special_settings
      add constraint guda_special_settings_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'access_codes_created_by_fkey' and confdeltype = 'a'
  ) then
    alter table public.access_codes alter column created_by drop not null;
    alter table public.access_codes drop constraint access_codes_created_by_fkey;
    alter table public.access_codes
      add constraint access_codes_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;
  end if;
end $$;
