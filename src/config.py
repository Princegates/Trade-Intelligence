"""What to track, and how much history the signal engine needs."""

import os

# api.binance.com answers 451 Unavailable For Legal Reasons to US IPs, which
# is every GitHub Actions runner, so the hourly job cannot use it. api.binance.us
# serves those IPs and returns the identical kline format. The reverse is also
# true — Binance.US blocks non-US callers — so running locally from outside the
# US means setting BINANCE_BASE_URL back to api.binance.com.
# `or` rather than a get() default: CI sets unconfigured variables to the empty
# string, which would otherwise override this with "" and fail every fetch.
BINANCE_BASE_URL = os.environ.get("BINANCE_BASE_URL") or "https://api.binance.us/api/v3/klines"

# Every stored signal records the version that produced it, so a past call can
# be reproduced from its inputs (FR-SIG-005). Bump this whenever the scoring
# logic changes; signals from different versions coexist rather than overwrite.
#
# 2.0.0: replaced independent per-indicator voting (RSI, MACD, SMA20/50,
# pattern) with four confluence categories (EMA stack, RSI+MACD combined,
# market structure, gated candlestick confirmation) and a stricter threshold.
# A verdict tagged 1.0.0 was never touched by this change — it stays exactly
# what the old engine called it — but a new candle evaluated under the new
# logic has to carry a version that actually says so, or nothing downstream
# (accuracy.py, a future backtest) could tell the two scoring schemes apart.
#
# 2.1.0: added the economic-calendar gate (src/signals/event_risk.py) —
# the same candle, same price data, can now publish HOLD instead of a
# 2.0.0 BUY/SELL if it lands inside a scheduled high-impact USD release.
# That is a real change in what gets published for identical technical
# inputs, which is exactly what this field exists to distinguish.
#
# 2.1.1: tightened the stop from 1.5 ATR to 0.75 ATR (src/signals/engine.py
# STOP_ATRS) for stricter risk management. The verdict and score are
# unchanged for identical inputs, but entry/stop/target are themselves part
# of what a signal publishes, so a candle scored before this change and one
# scored after it carry materially different levels under the same call.
#
# 3.0.0: added three new veto-only gates (src/signals/engine.py::evaluate) —
# cross-timeframe confluence (src/signals/confluence.py, opposing higher-
# timeframe structure forces HOLD), a real minimum risk/reward filter, and
# a minimum-confidence filter — plus a genuine (if intentionally modest,
# non-calibrated) confidence score replacing the always-null placeholder.
# All three new gates are admin-configurable via the engine_settings table
# and stay fully inert (reproducing 2.1.1's exact behavior) until that
# table is actually read and populated — but once it is, this is a real,
# material change in what gets published for identical technical inputs,
# same bar every prior bump here was held to. Major-versioned rather than
# a patch bump because the gates are new decision surface, not a tuning
# tweak to existing ones.
#
# 3.1.0 (Phase 2a, src/signals/entry_zone.py): stop/target/invalidation are
# now derived from real market structure when it's available, rather than
# always a fixed ATR multiple of each other — this is what finally lets
# the 3.0.0 risk/reward gate discriminate between signals instead of
# passing or failing every one identically. Unlike 2.1.1's uniform ATR
# retightening, this is data-dependent: two signals minutes apart can get a
# structural stop vs. the ATR fallback depending on whether a swing
# happens to sit nearby — an accepted tradeoff for genuinely variable R:R,
# and it falls back to exactly 2.1.1's math whenever there aren't enough
# swings yet, so no settings gate is needed for that guarantee. Also added:
# a settings-gated veto (an admin-configured maximum ATR distance from a
# call's own entry zone forces HOLD — new decision surface, inert without
# that setting, same pattern as the 3.0.0 gates); `regime`/`market_phase`
# now published on every signal, including HOLD (market-state facts, not
# about any one call); and the confidence score's pullback-quality and
# support/resistance categories now read real entry-zone/pooled-touches
# data instead of 3.0.0's documented proxies — same eight categories and
# point totals, more accurate inputs.
#
# 3.2.0: high-impact USD releases now hold back BTC calls too, not only gold
# (EVENT_RISK_CURRENCY below) — the same candle can publish HOLD where 3.1.0
# published a BUY/SELL. Also available from 3.2.0, all off unless an
# engine setting switches them on: min_stop_atr, target_mode, swing_lookback,
# max_cost_to_risk, momentum_mode, rsi_chase_limit and entry_mode (see
# src/signals/engine.py) — tested with src/backtest.py before any is used.
#
# 3.3.0: three of those switched on (config.ENGINE_SETTING_DEFAULTS below):
# stops at least 1.5 ATR from the entry, targets a multiple of the actual
# risk, and no call whose trading costs exceed a quarter of its risk. Same
# votes and gates otherwise; different levels and fewer short-timeframe
# calls for identical candles.
STRATEGY_VERSION = "3.3.0"

# GUDA SPECIAL is a second, independent strategy (15m Break & Retest ->
# Fibonacci retracement -> candlestick confirmation) published alongside
# the confluence engine above, never replacing it — its own lineage, own
# tables (guda_special_setups/guda_special_signals), own version string, so
# the two are never confusable in a query or a dashboard filter. See
# src/signals/setups.py.
#
# 1.1.0: one setup per broken level (not one per candle still beyond it);
# the Fibonacci zone measured on the full impulse instead of the break
# candle; Engulfing confirmations read against the pullback so they can
# actually fire; stop beyond the broken level; minimum reward-to-risk to
# the nearest structure; WEAK confirmations and HTF-opposed CHoCH setups
# rejected; no publishing inside a high-impact release window.
#
# The release window follows EVENT_RISK_CURRENCY, so from engine 3.2.0 it
# covers BTC setups as well as gold — a config change outside GUDA
# SPECIAL's own rules, deliberately not a version bump (that would reset
# the dashboard card to waiting for a first signal).
GUDA_SPECIAL_STRATEGY_VERSION = "guda-special-1.1.0"

INSTRUMENTS = [
    {
        "symbol": "BTCUSDT",
        "provider": "binance",
        "provider_symbol": "BTCUSDT",
        "timeframes": ["5m", "15m", "1h", "4h", "1d"],
    },
    {
        # All five fit inside Twelve Data's free 800 requests a day. A run
        # only calls a provider when that timeframe's candle could have
        # closed, so a series costs its own candle rate rather than one
        # request per poll: 288 + 96 + 24 + 6 + 1 = 415 on a trading day.
        # A weekend peaks at 704 on the first closed day, because 1d does not
        # go stale within a single day and so keeps asking unthrottled.
        "symbol": "XAUUSD",
        "provider": "twelvedata",
        "provider_symbol": "XAU/USD",
        "timeframes": ["5m", "15m", "1h", "4h", "1d"],
    },
]

# Candle boundaries are derived from open_time + duration for every provider,
# so completeness is decided by one documented rule rather than per-feed quirks.
TIMEFRAME_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
    "1w": 604800,
}

# The floor for a directional call at all. EMA200 and swing-based structure
# both want more history than this and simply report themselves unavailable
# below it — that degrades one category's vote rather than blocking every
# series for two days while gold's newest timeframes catch up (BR-006: never
# substitute; here, never manufacture a floor high enough to starve a
# newly-added series of signals it would otherwise be able to produce).
MIN_CANDLES_FOR_SIGNAL = 60

# Categories that must return a value before a directional call is allowed.
# Below this the engine returns HOLD rather than guessing from thin evidence.
MIN_EVIDENCE = 2

# Net category votes needed to call a direction; below it the answer is HOLD.
# The four categories are EMA trend, momentum (RSI+MACD, one vote between
# them), market structure and candlestick confirmation — each -1/0/+1, so
# ±2 means at least two independent categories agree and none contradicts.
# This replaces a per-indicator ±1 threshold that was backtested against a
# different, more easily correlated scoring scheme (RSI, MACD and an SMA
# cross could all fire from the same underlying move); that backtest no
# longer applies to categories built to avoid double-counting. ±2 is a
# considered default, not a re-run backtest — there isn't yet a comparable
# volume of resolved signals under the new scheme to calibrate against (see
# `confidence`, and revisit via src/accuracy.py once there is).
BUY_THRESHOLD = 2

# How many candles to pull per request/store per refresh. Bumped from 200 so
# EMA200 has a little room to report a slope, not just a single bootstrapped
# value — this changes response size, not request count, so it does not
# touch the quota math above.
CANDLE_FETCH_LIMIT = 260

# Scoring a trade (src/trade_sim.py) — shared by the live outcome tracker and
# the backtest so both measure the same thing.
#
# Round-trip trading cost as a percent of price, subtracted from every
# trade's result: fees in and out plus slippage. BTC: 0.10% taker fee each
# side (Binance spot, no BNB discount) plus ~0.02% slippage each side. Gold:
# a typical retail XAU/USD spread plus slippage. Deliberately not the
# cheapest tier — a result that only survives best-case costs isn't one.
TRADE_COST_PCT = {"BTCUSDT": 0.24, "XAUUSD": 0.04}
DEFAULT_TRADE_COST_PCT = 0.10

# Candles of the trade's own timeframe before a trade that has hit neither
# stop nor target is closed at that candle's close. GUDA SPECIAL's matches
# src/backtest_guda.py (96 x 15m = one day).
TRADE_MAX_BARS = {"confluence": 50, "guda_special": 96}

# Engine options (src/signals/engine.py) switched on for every live run and
# every backtest, on top of the engine's own defaults and under any value
# an admin has saved in engine_settings. Options are added here only once
# src/backtest.py shows they help, with a STRATEGY_VERSION bump.
#
# 3.3.0, from the Stage 2 backtests on BTC (5m to 1d, 2 months to 6 years):
# - min_stop_atr 1.5: stops at the nearest two-candle swing sat 0.3-0.5 ATR
#   from the entry, inside ordinary noise, and costs ran to 1-10x the risk.
# - target_mode "atr": the target is reward_to_risk x the actual risk, not
#   the nearest opposing swing (as noisy as the nearest supporting one).
#   Tested best at reward_to_risk 3, which is set in engine_settings (the
#   admin's "Reward:risk"), not here, so the admin setting stays the knob.
# - max_cost_to_risk 0.25: no call whose round-trip costs exceed a quarter
#   of its risk — in practice most 5m and 15m calls.
# Average R per trade after costs went from -1.30 / -0.72 / -0.27 on
# 1h / 4h / 1d to -0.08 / -0.02 / +0.73, better in both halves of the
# history. Momentum mode, pullback entries, breakeven stops and bigger
# swing points were tested too and didn't help, so they stay off.
ENGINE_SETTING_DEFAULTS = {"min_stop_atr": 1.5, "target_mode": "atr", "max_cost_to_risk": 0.25}

# A feed counts as stale once its newest closed candle is this many intervals
# overdue. Stale markets get a suppression record instead of a signal, so a
# closed or broken feed can never masquerade as a live call.
STALENESS_INTERVALS = 2

# How often to retry a feed that has already gone stale. Gold has no weekend
# candles, so nothing new ever arrives and every poll would spend a request
# being told so — 1440 across a Saturday for gold's five timeframes, against
# a free tier of 800 a day. Retrying on the half hour costs a stale series 96
# attempts instead — 480 across gold's five timeframes — and still notices
# the market reopening well within an hour.
STALE_RETRY_SECONDS = 1800

# The slice of each retry period in which an attempt is allowed. Must be at
# least the polling interval, or a slower poller steps over every window and
# never retries at all. Ten minutes leaves room for a five-minute poll to
# drift or be delayed.
STALE_RETRY_WINDOW = 600

# Confirmed swing highs/lows need this many candles clear on each side before
# they count — a swing is only real once you can see what happened after it.
# 2 is the standard fractal window: tight enough to find swings on a 5m
# chart, wide enough not to call every wiggle a turning point.
SWING_LOOKBACK = 2

# How close two swing highs (or two swing lows) have to be, as a fraction of
# price, to count as the same pooled level rather than two different ones.
# 0.15% is roughly a gold ATR tick on a 15m candle — tight enough that this
# does not lump together levels a real trader would treat as distinct.
EQUAL_LEVEL_TOLERANCE = 0.0015

# A candle whose range exceeds this many ATRs is treated as an abnormal
# volatility spike and forces HOLD regardless of what else agrees — a move
# can score every category correctly and still be too extended to enter
# safely the moment it happens (spec section 13).
VOLATILITY_SPIKE_ATR = 2.5

# Which currency's high-impact releases should gate an instrument (spec
# section 6, gold's USD/Fed/macro sensitivity). BTC was left out at first,
# its spec pointing at funding/leverage/liquidations instead — but it moves
# as hard as gold on US CPI, FOMC and payrolls, and a call made minutes
# before one is a coin toss with a stop in the way. Since 3.2.0 it's gated
# on the same USD releases.
EVENT_RISK_CURRENCY = {"XAUUSD": "USD", "BTCUSDT": "USD"}

# How long before and after a high-impact release to hold off. Spread widens
# and price can spike in either direction right at release and for a while
# after, while the market digests the number.
EVENT_RISK_BEFORE_MINUTES = 30
EVENT_RISK_AFTER_MINUTES = 60
