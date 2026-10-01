-- Trade Intelligence: Core Market Intelligence upgrade — new, purely
-- additive context columns shared by both strategies (src/signals/
-- price_range.py, src/signals/volatility_regime.py; the confluence
-- engine's own Fibonacci read, src/signals/engine.py
-- _fibonacci_and_range_context). None of this changes any existing
-- verdict/gate/column — informational market context only, same
-- "describes the market, not the call" precedent regime/market_phase
-- already follow (0016_entry_zone_and_regime.sql).
--
-- signals.confidence_breakdown: the same eight confidence categories the
-- existing reasoning text already spells out in prose, as structured
-- jsonb instead — e.g. {"total": 82, "trend": {"score": 20, "max": 20},
-- "structure": {...}, ...}. Null on HOLD, same as confidence itself.
--
-- signals.fib_50/fib_61_8/fib_72/fib_78_6/fib_direction: Fibonacci
-- retracement levels of the most recently confirmed swing leg — the
-- confluence engine never had Fibonacci data before this (confirmed by
-- the architecture audit that prompted this migration: GUDA SPECIAL has
-- always had its own fib_* columns on guda_special_signals, but nothing
-- on the confluence engine's signals table did). Informational only,
-- never read by any gate.
--
-- signals.range_position_pct/range_zone, and the same two columns on
-- guda_special_signals: premium/discount range position over that same
-- swing leg (0 = at the leg's low, 100 = at its high; DEEP_DISCOUNT /
-- DISCOUNT / EQUILIBRIUM / PREMIUM / DEEP_PREMIUM). GUDA SPECIAL reads
-- it over its own already-tracked impulse leg.
--
-- signals.volatility_regime and guda_special_signals.volatility_regime:
-- LOW/NORMAL/HIGH/EXTREME, current ATR against a longer-run baseline —
-- the architecture audit found no multi-level volatility classification
-- existed anywhere in the codebase before this (only a binary spike veto
-- and an unlabeled ratio gate). guda_special_signals does not get new
-- Fibonacci columns — it already has its own from its own pipeline.
--
-- Safe to re-run.

alter table public.signals add column if not exists volatility_regime text;
alter table public.signals add column if not exists confidence_breakdown jsonb;
alter table public.signals add column if not exists fib_50 double precision;
alter table public.signals add column if not exists fib_61_8 double precision;
alter table public.signals add column if not exists fib_72 double precision;
alter table public.signals add column if not exists fib_78_6 double precision;
alter table public.signals add column if not exists fib_direction integer;
alter table public.signals add column if not exists range_position_pct double precision;
alter table public.signals add column if not exists range_zone text;

comment on column public.signals.volatility_regime is
  'LOW/NORMAL/HIGH/EXTREME — current ATR(14) against a longer-run ATR(100) baseline; src/signals/volatility_regime.py. Informational only, never a gate.';
comment on column public.signals.confidence_breakdown is
  'Structured per-category confidence score (src/signals/engine.py::_confidence) — the same breakdown the existing reasoning text already states in prose. Null on HOLD.';
comment on column public.signals.fib_50 is
  'Fibonacci 50% retracement of the most recently confirmed swing leg (src/signals/fibonacci.py, shared with GUDA SPECIAL). Informational only, never an automatic entry signal.';
comment on column public.signals.fib_61_8 is 'Fibonacci 61.8% retracement of the same swing leg as fib_50.';
comment on column public.signals.fib_72 is 'Fibonacci 72% retracement of the same swing leg as fib_50.';
comment on column public.signals.fib_78_6 is 'Fibonacci 78.6% retracement of the same swing leg as fib_50.';
comment on column public.signals.fib_direction is '1 for a bullish swing leg (retracement measured down), -1 for bearish.';
comment on column public.signals.range_position_pct is
  'Where price sits within the same swing leg Fibonacci is measured from, as a percentage (0 = leg low, 100 = leg high; can fall outside that band). src/signals/price_range.py.';
comment on column public.signals.range_zone is
  'DEEP_DISCOUNT / DISCOUNT / EQUILIBRIUM / PREMIUM / DEEP_PREMIUM, derived from range_position_pct. Never interpreted as a buy/sell signal on its own.';

alter table public.guda_special_signals add column if not exists volatility_regime text;
alter table public.guda_special_signals add column if not exists range_position_pct double precision;
alter table public.guda_special_signals add column if not exists range_zone text;

comment on column public.guda_special_signals.volatility_regime is
  'LOW/NORMAL/HIGH/EXTREME — current ATR(14) against a longer-run ATR(100) baseline; src/signals/volatility_regime.py, the same shared classifier the confluence engine also populates. Informational only, never a gate.';
comment on column public.guda_special_signals.range_position_pct is
  'Where price sits within this setup''s own tracked impulse leg (the same leg fib_50 etc. above are already measured from), as a percentage. src/signals/price_range.py.';
comment on column public.guda_special_signals.range_zone is
  'DEEP_DISCOUNT / DISCOUNT / EQUILIBRIUM / PREMIUM / DEEP_PREMIUM, derived from range_position_pct.';
