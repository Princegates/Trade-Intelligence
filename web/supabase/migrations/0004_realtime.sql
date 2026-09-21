-- Trade Intelligence: enable Realtime on the signals feed, so the
-- dashboard can subscribe to new rows instead of only refreshing on load.
--
-- Idempotent (re-runnable): ALTER PUBLICATION ... ADD TABLE errors if the
-- table is already a member, so each table is guarded with an existence
-- check first, the same way 0001 was made re-runnable.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'signals'
  ) then
    alter publication supabase_realtime add table public.signals;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'signal_suppressions'
  ) then
    alter publication supabase_realtime add table public.signal_suppressions;
  end if;
end $$;
