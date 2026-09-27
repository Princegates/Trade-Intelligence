-- Trade Intelligence: lead capture for the pricing page's access-request
-- form and the homepage's waitlist form.
--
-- Previously the pricing page's only "Full access" CTA was a bare
-- mailto: link — no record kept, nothing trackable, and it requires the
-- visitor's mail client to be configured. This gives both forms somewhere
-- to write to, and gives an admin a real list to work from instead of
-- whatever lands in an inbox.
--
-- Public-insert, admin-only-read: anyone, signed in or not, can submit a
-- lead (the pricing/homepage forms both run unauthenticated for most
-- visitors), but only an admin can list or update them.
--
-- Safe to re-run.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('waitlist', 'access_request')),
  email text not null,
  name text,
  note text,
  created_at timestamptz not null default now(),
  handled boolean not null default false
);

alter table public.leads enable row level security;

drop policy if exists "leads: anyone can submit" on public.leads;
create policy "leads: anyone can submit" on public.leads
  for insert to anon, authenticated with check (true);

drop policy if exists "leads: admins read" on public.leads;
create policy "leads: admins read" on public.leads
  for select using (public.is_admin(auth.uid()));

drop policy if exists "leads: admins update" on public.leads;
create policy "leads: admins update" on public.leads
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
