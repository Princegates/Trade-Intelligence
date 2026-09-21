"""Binance public REST API — no key required."""

import requests

BASE_URL = "https://api.binance.com/api/v3/klines"


def fetch_klines(symbol: str, interval: str, limit: int = 200):
    params = {"symbol": symbol, "interval": interval, "limit": limit}
    resp = requests.get(BASE_URL, params=params, timeout=15)
    resp.raise_for_status()
    raw = resp.json()

    candles = []
    for row in raw:
        candles.append(
            {
                "open_time": int(row[0]) // 1000,
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]),
            }
        )
    return candles
