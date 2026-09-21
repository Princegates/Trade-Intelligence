"""What to track, and how much history the signal engine needs."""

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

# SMA50 is the longest lookback the engine uses, so this is the floor.
MIN_CANDLES_FOR_SIGNAL = 60

# How many candles to pull per request/store per refresh.
CANDLE_FETCH_LIMIT = 200
