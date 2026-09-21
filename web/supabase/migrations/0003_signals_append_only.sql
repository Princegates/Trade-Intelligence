-- Trade Intelligence: make signal immutability real.
--
-- 0002 dropped the update policy on public.signals, which stops the app's
-- own roles (anon, authenticated) from rewriting a published call. It does
-- not stop `service_role`, which carries BYPASSRLS — and that is exactly the
-- key the hourly job authenticates with. Row-level security alone therefore
-- left the strongest key in the system able to quietly rewrite history.
--
-- A trigger is not bypassed by BYPASSRLS, so this closes it for every role,
-- table owner included.
--
-- Corrections are new linked events, never edits (FR-SIG-004): publish a new
-- signal, or bump strategy_version to re-score the same candle.
--
-- Retention (DATA-005) will eventually need to delete aged rows. That has to
-- be a deliberate, audited act — drop this trigger, prune, recreate it —
-- rather than something a stray statement can do by accident.

create or replace function public.signals_are_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'public.signals is append-only: % rejected on signal id %', tg_op, old.id
    using hint = 'Publish a new signal, or bump strategy_version to re-score the candle.';
end;
$$;

drop trigger if exists signals_no_rewrite on public.signals;
create trigger signals_no_rewrite
  before update or delete on public.signals
  for each row execute function public.signals_are_append_only();
