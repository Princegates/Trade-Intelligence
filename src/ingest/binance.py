"""Binance public REST API — no key required."""

from datetime import datetime, timezone

import requests

from .. import config

BASE_URL = "https://api.binance.com/api/v3/klines"


def fetch_klines(symbol: str, interval: str, limit: int = 200, now: int | None = None):
    params = {"symbol": symbol, "interval": interval, "limit": limit}
    resp = requests.get(BASE_URL, params=params, timeout=15)
    resp.raise_for_status()
    raw = resp.json()

    now = now if now is not None else int(datetime.now(timezone.utc).timestamp())
    duration = config.TIMEFRAME_SECONDS[interval]

    candles = []
    for row in raw:
        open_time = int(row[0]) // 1000
        candles.append(
            {
                "open_time": open_time,
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]),
                "complete": open_time + duration <= now,
            }
        )
    return candles
