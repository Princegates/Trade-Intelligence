-- Trade Intelligence: backtest results by confidence score (admin only),
-- and an admin switch to show backtested hit rates on signal cards.
--
-- backtest_runs.calibration: how the run's trades turned out grouped by
-- their call's confidence score (src/backtest.py confidence_bands), e.g.
--   [{"low": 70, "high": 74, "trades": 212, "target_rate": 0.31,
--     "win_rate": 0.33, "avg_r_net": 0.05}, ...]
-- Shown on /admin/performance. Null on runs saved before this migration.
--
-- live_results_settings.show_backtest_odds: when on, each BUY/SELL card
-- says how often its timeframe's calls reached their target in the
-- backtest. Off by default, like the live-results switch beside it.
--
-- Safe to re-run.

alter table public.backtest_runs add column if not exists calibration jsonb;

alter table public.live_results_settings
  add column if not exists show_backtest_odds boolean not null default false;
