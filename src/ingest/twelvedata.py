"""Twelve Data REST API for gold (XAU/USD). Free tier, requires an API key.

Set TWELVEDATA_API_KEY (env var / GitHub Actions secret). If it's missing,
fetch_klines returns None so callers can skip gold gracefully instead of
crashing the whole run.
"""

import os
from datetime import datetime, timezone

import requests

BASE_URL = "https://api.twelvedata.com/time_series"

INTERVAL_MAP = {
    "1h": "1h",
    "4h": "4h",
    "1d": "1day",
}


def fetch_klines(symbol: str, interval: str, limit: int = 200, api_key: str | None = None):
    api_key = api_key or os.environ.get("TWELVEDATA_API_KEY")
    if not api_key:
        return None

    params = {
        "symbol": symbol,
        "interval": INTERVAL_MAP.get(interval, interval),
        "outputsize": limit,
        "timezone": "UTC",
        "apikey": api_key,
        "format": "JSON",
    }
    resp = requests.get(BASE_URL, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()

    if "values" not in data:
        raise RuntimeError(f"Twelve Data error for {symbol}/{interval}: {data}")

    candles = []
    for row in reversed(data["values"]):  # API returns newest first
        raw_dt = row["datetime"]
        fmt = "%Y-%m-%d %H:%M:%S" if " " in raw_dt else "%Y-%m-%d"
        open_time = int(datetime.strptime(raw_dt, fmt).replace(tzinfo=timezone.utc).timestamp())
        candles.append(
            {
                "open_time": open_time,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row.get("volume") or 0.0),
            }
        )
    return candles
