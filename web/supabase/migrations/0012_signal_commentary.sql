-- Trade Intelligence: optional AI-written commentary alongside a signal.
--
-- Additive, not a replacement: src/lib/plain-language.ts's deterministic,
-- free, instant summary is still what every signal card shows first. This
-- table holds a second, longer paragraph an LLM writes about the same
-- already-decided call, when the admin has an AI provider configured and
-- active (see /admin/settings). The verdict itself is never AI-generated —
-- only commentary *about* a verdict the rule-based engine already reached.
--
-- Generated once, server-side, by the Python cron job right after it
-- publishes a signal (src/ai/commentary.py) — never on a per-request basis
-- from the web app, so the cost and rate limits stay decoupled from how
-- many people are looking at the dashboard, the same way market-data API
-- calls already are (see the trial-access migration's note on that).
--
-- Same identity as the signal it comments on (0002_signal_integrity.sql),
-- so the web app can join them without a foreign key round trip: it doesn't
-- need signals.id, just the tuple it already has.
--
-- Safe to re-run.

create table if not exists public.signal_commentary (
  symbol text not null,
  timeframe text not null,
  candle_time timestamptz not null,
  strategy_version text not null,
  commentary text not null,
  model text not null,
  generated_at timestamptz not null default now(),
  primary key (symbol, timeframe, candle_time, strategy_version)
);

alter table public.signal_commentary enable row level security;

-- Same audience as the signal itself: authenticated users, plus anon for the
-- homepage's public preview (0008_public_signal_preview.sql). No insert/
-- update policy for either — only the cron job's service_role key (which
-- bypasses RLS) ever writes here.
drop policy if exists "signal_commentary: authenticated users read" on public.signal_commentary;
create policy "signal_commentary: authenticated users read" on public.signal_commentary
  for select to authenticated using (true);

drop policy if exists "signal_commentary: public preview" on public.signal_commentary;
create policy "signal_commentary: public preview" on public.signal_commentary
  for select to anon using (true);
