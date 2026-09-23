-- Trade Intelligence: let anonymous visitors read signals too.
--
-- The marketing homepage shows three real signals as a preview before
-- signup. Previously it could only show sample data, because the existing
-- read policy (0001_init.sql) is scoped to `authenticated` and an
-- anonymous visitor's client authenticates as `anon`.
--
-- This adds a second, permissive policy for `anon` specifically, rather
-- than widening the existing one — the two stay legible as separate grants
-- (logged-in vs. public) even though their effect overlaps. RLS policies
-- are OR'd together, so this does not narrow what an authenticated user can
-- already see; it only adds what anon can.
--
-- Real consequence, not a formality: every row in `signals` becomes
-- readable by anyone with the public anon key, not only the three the
-- homepage renders — Postgres RLS has no notion of "only these three rows,
-- only from this page." The homepage's own code still only displays three;
-- the data underneath all of it is now public regardless of who queries it
-- or how. Full signal history and the dashboard itself still require an
-- account (they call this same table, but nothing about *this* migration
-- makes the dashboard's own auth check optional).
--
-- Safe to re-run.

drop policy if exists "signals: public preview" on public.signals;
create policy "signals: public preview" on public.signals
  for select to anon using (true);
