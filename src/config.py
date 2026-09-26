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
STRATEGY_VERSION = "3.0.0"

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
# section 6, gold's USD/Fed/macro sensitivity). BTC is deliberately absent:
# its own spec section calls out funding/leverage/liquidations instead of a
# macro calendar, and there is no free feed for those either — see README.
EVENT_RISK_CURRENCY = {"XAUUSD": "USD"}

# How long before and after a high-impact release to hold off. Spread widens
# and price can spike in either direction right at release and for a while
# after, while the market digests the number.
EVENT_RISK_BEFORE_MINUTES = 30
EVENT_RISK_AFTER_MINUTES = 60
