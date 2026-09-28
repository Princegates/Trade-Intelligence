"""Bitcoin perpetual futures funding rates, for the engine's crowded-trade
veto (engine.evaluate's `funding`, the max_crowded_funding setting).

Funding is what one side of a perpetual futures contract pays the other to
keep the contract's price near spot. When longs pay heavily, leveraged
money is piled onto one side, and those moves often snap back.

Several public sources are tried in order, because the servers that run
the engine (GitHub's, in the US) are refused by some exchanges; Binance
answers them 451, which is why the candle feed uses Binance.US. The first
source that answers with believable data is used for the whole run. Rates
are converted to percent per 8 hours (Binance's convention) whatever the
source's own interval, so a threshold means the same thing on any of them.
"""

from bisect import bisect_right
from datetime import datetime, timezone
from itertools import accumulate

import requests

HOUR = 3600

# The rate a call is judged by: the average over the day before the
# candle's close, so one odd funding print doesn't decide it.
WINDOW_SECONDS = 24 * HOUR

# A typical Bitcoin funding rate is about 0.01% per 8 hours. A source whose
# median lands far outside this is almost certainly being read in the wrong
# units, and is skipped rather than trusted.
PLAUSIBLE_MEDIAN_PER_8H = 0.2


def _binance(start_time):
    """USDT-margined BTCUSDT, every 8 hours, from late 2019."""
    out, cursor = [], start_time * 1000
    while True:
        resp = requests.get(
            "https://fapi.binance.com/fapi/v1/fundingRate",
            params={"symbol": "BTCUSDT", "startTime": cursor, "limit": 1000},
            timeout=20,
        )
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            break
        out += [(int(r["fundingTime"]) // 1000, float(r["fundingRate"])) for r in rows]
        if len(rows) < 1000:
            break
        cursor = int(rows[-1]["fundingTime"]) + 1
    return out


def _kraken(symbol):
    """Kraken Futures, hourly; the whole history in one response."""

    def fetch(start_time):
        resp = requests.get(
            "https://futures.kraken.com/derivatives/api/v4/historicalfundingrates",
            params={"symbol": symbol},
            timeout=60,
        )
        resp.raise_for_status()
        out = []
        for r in resp.json().get("rates") or []:
            t = int(datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")).timestamp())
            if t >= start_time:
                out.append((t, float(r["relativeFundingRate"])))
        return out

    return fetch


def _hyperliquid(start_time):
    """Hyperliquid, hourly, from mid-2023; 500 records a request."""
    out, cursor = [], start_time * 1000
    while True:
        resp = requests.post(
            "https://api.hyperliquid.xyz/info",
            json={"type": "fundingHistory", "coin": "BTC", "startTime": cursor},
            timeout=20,
        )
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            break
        out += [(int(r["time"]) // 1000, float(r["fundingRate"])) for r in rows]
        if len(rows) < 500:
            break
        cursor = int(rows[-1]["time"]) + 1
    return out


# Longest history first.
SOURCES = (
    ("Binance futures", _binance),
    ("Kraken Futures PI_XBTUSD", _kraken("PI_XBTUSD")),
    ("Kraken Futures PF_XBTUSD", _kraken("PF_XBTUSD")),
    ("Hyperliquid", _hyperliquid),
)


def per_8h_percent(records):
    """[(time, rate as a fraction per the source's own interval)] ->
    [(time, percent per 8 hours)], oldest first. The interval is read from
    the records themselves (the median gap), so hourly and 8-hourly
    sources come out on the same scale."""
    records = sorted(set(records))
    if len(records) < 2:
        return []
    gaps = sorted(b[0] - a[0] for a, b in zip(records, records[1:]))
    interval = gaps[len(gaps) // 2]
    if interval <= 0:
        return []
    scale = 100 * 8 * HOUR / interval
    return [(t, rate * scale) for t, rate in records]


def fetch_history(start_time, sources=SOURCES, log=print):
    """(source name, [(time, % per 8h)]) from the first source that answers
    with plausible data, or (None, []) if none does."""
    for name, fetch in sources:
        try:
            series = per_8h_percent(fetch(start_time))
        except Exception as exc:
            log(f"  funding: {name} unavailable ({exc})")
            continue
        if not series:
            log(f"  funding: {name} returned nothing")
            continue
        median = sorted(r for _, r in series)[len(series) // 2]
        if abs(median) > PLAUSIBLE_MEDIAN_PER_8H:
            log(f"  funding: {name} skipped — median {median:.4f}% per 8h isn't a believable funding rate")
            continue
        first = datetime.fromtimestamp(series[0][0], tz=timezone.utc).strftime("%Y-%m-%d")
        log(f"  funding: {name}, {len(series)} rates since {first}, median {median:.4f}% per 8h")
        return name, series
    return None, []


def daily_average(series):
    """A function of a close time -> the average rate (% per 8h) paid in
    the day up to and including that time, or None with nothing paid in
    that day (before the source's history begins, or a gap). Only rates at
    or before the close are used, so a backtest can't see ahead."""
    times = [t for t, _ in series]
    prefix = [0.0, *accumulate(r for _, r in series)]

    def at(close_time):
        hi = bisect_right(times, close_time)
        lo = bisect_right(times, close_time - WINDOW_SECONDS)
        if hi == lo:
            return None
        return (prefix[hi] - prefix[lo]) / (hi - lo)

    return at
