-- Trade Intelligence: records the higher-timeframe structural bias a
-- signal was evaluated against, for cross-timeframe confluence
-- (src/signals/confluence.py, STRATEGY_VERSION 3.0.0+).
--
-- Nullable and additive, same pattern as 0005_levels_and_patterns.sql —
-- existing rows simply have no value here, and nothing reads this column
-- as required. Stored mainly for future queryability (e.g. a later
-- backtesting/calibration pass asking "how often did an agreeing higher
-- timeframe actually help") rather than anything the dashboard renders
-- today.
--
-- Safe to re-run.

alter table public.signals
  add column if not exists confluence_bias text;

comment on column public.signals.confluence_bias is
  'Higher-timeframe structural bias ("up"/"down"/"range") read at signal time, or null when no anchor-timeframe data was available; see src/signals/confluence.py.';
