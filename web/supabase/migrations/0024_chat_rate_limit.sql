-- Trade Intelligence: per-user rate limit for the Guda chat feature.
--
-- sendChatMessage (web/src/lib/actions/chat.ts) had no cap at all — a
-- full-access user could send messages back-to-back as fast as each reply
-- came back, each one a billed call to the configured AI provider. This
-- adds a sliding-window counter, checked and incremented atomically by
-- chat_rate_limit_check() (row-locked via SELECT ... FOR UPDATE) so
-- concurrent sends from the same user can't both slip through on a stale
-- read.
--
-- RLS is enabled with no policies at all — not even the row's own owner can
-- read or write it directly. The only way in is chat_rate_limit_check(), a
-- SECURITY DEFINER function, or the service-role key. That's deliberate:
-- this table is bookkeeping for the rate limit itself, not user-facing data.
--
-- Safe to re-run.

create table if not exists public.chat_rate_limit (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null default now(),
  message_count int not null default 0
);

alter table public.chat_rate_limit enable row level security;

comment on table public.chat_rate_limit is
  'Sliding-window message counter for the Guda chat feature (see chat_rate_limit_check()). Bookkeeping only, not user-facing data — RLS has no policies on purpose, so only the SECURITY DEFINER function below or the service-role key can touch it.';

-- Returns true and counts the message if the caller is still within
-- max_per_window for the current window_seconds-wide window; false
-- (without counting it) once the window is full. Resets the window rather
-- than rejecting once window_seconds has fully elapsed since it started,
-- so a user is never stuck past their last active window.
--
-- Row-locks the caller's own counter row with SELECT ... FOR UPDATE before
-- deciding, so two concurrent sends from the same user can't both read the
-- same pre-increment count and both get allowed through.
create or replace function public.chat_rate_limit_check(uid uuid, max_per_window int, window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  existing record;
  allowed boolean;
begin
  select window_start, message_count
    into existing
    from public.chat_rate_limit
    where user_id = uid
    for update;

  if not found then
    -- First message this user has ever sent. `on conflict do nothing`
    -- guards the rare race of two concurrent first-ever sends; worst case
    -- both are allowed through once, which a rate limiter can live with.
    insert into public.chat_rate_limit (user_id, window_start, message_count)
    values (uid, now(), 1)
    on conflict (user_id) do nothing;
    return true;
  end if;

  if existing.window_start <= now() - make_interval(secs => window_seconds) then
    update public.chat_rate_limit
      set window_start = now(), message_count = 1
      where user_id = uid;
    return true;
  end if;

  allowed := existing.message_count < max_per_window;
  if allowed then
    update public.chat_rate_limit
      set message_count = message_count + 1
      where user_id = uid;
  end if;

  return allowed;
end;
$$;
