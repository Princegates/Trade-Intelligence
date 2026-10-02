-- Trade Intelligence: catches up a gap left by 0022 (the ALIVEDESTINY ->
-- GUDA SPECIAL rename), surfaced by running 0033_allow_user_deletion.sql.
--
-- 0022 renamed every check constraint, RLS policy, and the table itself
-- from alivedestiny_settings to guda_special_settings, but missed this one
-- foreign key — it's still named alivedestiny_settings_updated_by_fkey.
-- Because of that, 0033's matching do-block (which only looks for
-- guda_special_settings_updated_by_fkey) found nothing and silently
-- no-opped, leaving this the one constraint still ON DELETE NO ACTION.
--
-- This renames it to match every other object on the table and relaxes it
-- to ON DELETE SET NULL, same reasoning as every other block in 0033: who
-- last changed a setting is a historical fact worth keeping queryable,
-- not a reason to block deleting their account.
--
-- Handles both states a re-run could find it in: still under the old name
-- (the current state, per a live check), or already renamed by hand but
-- not yet relaxed.
--
-- Safe to re-run.

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'alivedestiny_settings_updated_by_fkey'
      and conrelid = 'public.guda_special_settings'::regclass
      and confdeltype = 'a'
  ) then
    alter table public.guda_special_settings drop constraint alivedestiny_settings_updated_by_fkey;
    alter table public.guda_special_settings
      add constraint guda_special_settings_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'guda_special_settings_updated_by_fkey'
      and conrelid = 'public.guda_special_settings'::regclass
      and confdeltype = 'a'
  ) then
    alter table public.guda_special_settings drop constraint guda_special_settings_updated_by_fkey;
    alter table public.guda_special_settings
      add constraint guda_special_settings_updated_by_fkey foreign key (updated_by) references public.profiles (id) on delete set null;
  end if;
end $$;
