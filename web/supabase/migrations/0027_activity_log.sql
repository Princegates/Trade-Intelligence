-- Trade Intelligence: system log — one row per action anyone takes on the
-- platform (sign-ups, sign-ins, account changes, Guda messages, lead forms,
-- and every admin change), read by admins at /admin/logs.
--
-- Written only by the web app's server code through the service-role key
-- (src/lib/activity-log.ts), never from a browser: there is no insert
-- policy, so no signed-in user can write, forge or edit an entry.
--
-- Append-only: a trigger rejects every UPDATE and DELETE, service role
-- included, so an entry can't be quietly changed or removed from the app
-- side. Clearing old entries is a deliberate act in the SQL editor
-- (disable the trigger, delete, re-enable).
--
-- actor_id/target_id are plain uuids/text, not foreign keys: the log has to
-- outlive the accounts it mentions, and an ON DELETE SET NULL would itself
-- be an UPDATE the trigger blocks. actor_email and target_label are
-- snapshots taken at the time, for the same reason.
--
-- Safe to re-run.

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  target_type text,
  target_id text,
  target_label text,
  details jsonb not null default '{}'::jsonb,
  outcome text not null default 'success' check (outcome in ('success', 'failure')),
  ip text,
  user_agent text
);

create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);
create index if not exists activity_log_actor_id_idx on public.activity_log (actor_id, created_at desc);
create index if not exists activity_log_action_idx on public.activity_log (action, created_at desc);

alter table public.activity_log enable row level security;

drop policy if exists "activity_log: admins read" on public.activity_log;
create policy "activity_log: admins read" on public.activity_log
  for select using (public.is_admin(auth.uid()));

create or replace function public.activity_log_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'activity_log is append-only';
end;
$$;

drop trigger if exists activity_log_append_only on public.activity_log;
create trigger activity_log_append_only
  before update or delete on public.activity_log
  for each row execute function public.activity_log_append_only();
