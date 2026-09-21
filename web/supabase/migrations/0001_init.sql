-- Trade Intelligence: initial schema.
-- Run in the Supabase SQL editor, or via `supabase db push` once linked.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users row, carries the app-level role.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

create policy "profiles: read own row" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: admins read all rows" on public.profiles
  for select using (public.is_admin(auth.uid()));

create policy "profiles: update own row (not role)" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

create policy "profiles: admins update any row" on public.profiles
  for update using (public.is_admin(auth.uid()));

-- New auth.users row -> matching profiles row, defaulting to role 'user'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- app_settings: the admin settings panel's API configuration slots.
-- One row per (category, provider). `config` holds provider-specific fields
-- (API keys, sender IDs, etc.) as JSON. Admin-only, never exposed to `anon`.
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('email', 'sms', 'payments', 'push', 'ai')),
  provider text not null,
  is_active boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  unique (category, provider)
);

alter table public.app_settings enable row level security;

create policy "app_settings: admins only" on public.app_settings
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- signals: mirrors the Python signal engine's local SQLite schema
-- (see ../../src/storage/db.py in the repo root) so the dashboard can read
-- live BTC/gold signals if the cron job is pointed at this database instead
-- of (or in addition to) the committed SQLite file. Until then, the
-- dashboard falls back to demo data (see src/lib/demo-data.ts).
-- ---------------------------------------------------------------------------
create table if not exists public.signals (
  id bigint generated always as identity primary key,
  symbol text not null,
  timeframe text not null,
  generated_at timestamptz not null,
  candle_time timestamptz not null,
  price double precision not null,
  verdict text not null check (verdict in ('BUY', 'SELL', 'HOLD')),
  score integer not null,
  reasoning text not null,
  unique (symbol, timeframe, candle_time)
);

alter table public.signals enable row level security;

create policy "signals: authenticated users read" on public.signals
  for select using (auth.role() = 'authenticated');

create policy "signals: admins write" on public.signals
  for insert with check (public.is_admin(auth.uid()));

create policy "signals: admins update" on public.signals
  for update using (public.is_admin(auth.uid()));

create index if not exists signals_symbol_timeframe_idx on public.signals (symbol, timeframe, generated_at desc);

-- ---------------------------------------------------------------------------
-- Bootstrapping the first admin: sign up normally through the app, then run
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- from the Supabase SQL editor. There is no other way to create an admin,
-- by design.
-- ---------------------------------------------------------------------------
