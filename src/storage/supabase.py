"""Mirrors signals up to Supabase so the web dashboard can read them.

Talks to PostgREST over HTTPS with `requests` rather than a Postgres driver:
it needs no extra dependency and avoids the connection-pooling and IPv6
problems that bite direct Postgres connections from GitHub Actions runners.

SQLite stays the source of truth. Supabase is a mirror, so an unconfigured or
unreachable project degrades to a local-only run rather than failing it.
"""

import os
from datetime import datetime, timezone

import requests

TIMEOUT = 15

# Matches the unique index in web/supabase/migrations/0002_signal_integrity.sql.
# Sending these as on_conflict makes the insert a no-op when the candle has
# already been called, so the mirror cannot rewrite a published signal either.
SIGNAL_IDENTITY = "symbol,timeframe,candle_time,strategy_version"


REST_SUFFIX = "/rest/v1"


def _credentials():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None

    # The dashboard shows the project URL bare in Settings, but with /rest/v1
    # already appended in the API docs, so either is a reasonable thing to
    # paste. Accept both: the alternative is a request to /rest/v1/rest/v1/...
    # that 404s with nothing useful to go on.
    base = url.strip().rstrip("/")
    if base.endswith(REST_SUFFIX):
        base = base[: -len(REST_SUFFIX)]
    return base, key


def is_configured():
    return _credentials() is not None


def _utc(epoch_seconds):
    return datetime.fromtimestamp(epoch_seconds, timezone.utc).isoformat()


def _insert(table, row, on_conflict=None):
    credentials = _credentials()
    if credentials is None:
        return False

    url, key = credentials
    prefer = ["return=minimal"]
    params = {}
    if on_conflict:
        params["on_conflict"] = on_conflict
        prefer.append("resolution=ignore-duplicates")

    response = requests.post(
        f"{url}/rest/v1/{table}",
        params=params,
        json=[row],
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": ",".join(prefer),
        },
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return True


def publish_signal(
    symbol,
    timeframe,
    generated_at,
    candle_time,
    price,
    verdict,
    score,
    reasoning,
    evidence_count,
    strategy_version,
    confidence=None,
    patterns="",
    levels=None,
):
    levels = levels or {}
    return _insert(
        "signals",
        {
            "symbol": symbol,
            "timeframe": timeframe,
            "generated_at": _utc(generated_at),
            "candle_time": _utc(candle_time),
            "price": price,
            "verdict": verdict,
            "score": score,
            "confidence": confidence,
            "evidence_count": evidence_count,
            "strategy_version": strategy_version,
            "reasoning": reasoning,
            "patterns": patterns,
            "entry": levels.get("entry"),
            "stop": levels.get("stop"),
            "target": levels.get("target"),
            "buy_above": levels.get("buy_above"),
            "sell_below": levels.get("sell_below"),
        },
        on_conflict=SIGNAL_IDENTITY,
    )


def newest_mirrored_candle(symbol, timeframe):
    """open_time of the newest candle already mirrored, or None.

    One small request, so a run only uploads what is actually missing: after
    the first backfill that is a candle or two rather than the whole series.
    """
    credentials = _credentials()
    if credentials is None:
        return None

    url, key = credentials
    response = requests.get(
        f"{url}/rest/v1/candles",
        params={
            "symbol": f"eq.{symbol}",
            "timeframe": f"eq.{timeframe}",
            "select": "open_time",
            "order": "open_time.desc",
            "limit": "1",
        },
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    rows = response.json()
    if not rows:
        return None
    return datetime.fromisoformat(rows[0]["open_time"]).timestamp()


def publish_candles(symbol, timeframe, candles):
    """Mirror closed candles, newest-missing first. Returns how many were sent."""
    credentials = _credentials()
    if credentials is None or not candles:
        return 0

    since = newest_mirrored_candle(symbol, timeframe)
    pending = [
        c
        for c in candles
        if c["complete"] and (since is None or c["open_time"] > since)
    ]
    if not pending:
        return 0

    url, key = credentials
    response = requests.post(
        f"{url}/rest/v1/candles",
        params={"on_conflict": "symbol,timeframe,open_time"},
        json=[
            {
                "symbol": symbol,
                "timeframe": timeframe,
                "open_time": _utc(c["open_time"]),
                "open": c["open"],
                "high": c["high"],
                "low": c["low"],
                "close": c["close"],
                "volume": c["volume"],
            }
            for c in pending
        ],
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal,resolution=merge-duplicates",
        },
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return len(pending)


def publish_suppression(symbol, timeframe, observed_at, reason, detail=""):
    return _insert(
        "signal_suppressions",
        {
            "symbol": symbol,
            "timeframe": timeframe,
            "observed_at": _utc(observed_at),
            "reason": reason,
            "detail": detail,
        },
    )
