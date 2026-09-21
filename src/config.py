"""What to track, and how much history the signal engine needs."""

# Every stored signal records the version that produced it, so a past call can
# be reproduced from its inputs (FR-SIG-005). Bump this whenever the scoring
# logic changes; signals from different versions coexist rather than overwrite.
STRATEGY_VERSION = "1.0.0"

INSTRUMENTS = [
    {
        "symbol": "BTCUSDT",
        "provider": "binance",
        "provider_symbol": "BTCUSDT",
        "timeframes": ["1h", "4h", "1d"],
    },
    {
        "symbol": "XAUUSD",
        "provider": "twelvedata",
        "provider_symbol": "XAU/USD",
        "timeframes": ["1h", "4h", "1d"],
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

# SMA50 is the longest lookback the engine uses, so this is the floor.
MIN_CANDLES_FOR_SIGNAL = 60

# Indicators that must return a value before a directional call is allowed.
# Below this the engine returns HOLD rather than guessing from thin evidence.
MIN_EVIDENCE = 2

# How many candles to pull per request/store per refresh.
CANDLE_FETCH_LIMIT = 200

# A feed counts as stale once its newest closed candle is this many intervals
# overdue. Stale markets get a suppression record instead of a signal, so a
# closed or broken feed can never masquerade as a live call.
STALENESS_INTERVALS = 2
