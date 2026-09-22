"""Momentum divergence: price and an oscillator disagreeing about direction
at the last two comparable swings, often the first crack in a move before
price itself turns.

Deliberately never a vote of its own — spec section 13 treats divergence as
a false-signal *filter*: a reason to override a call back to WAIT, not a
reason to generate one. Engine.py uses it exactly that way.
"""


def align(candles, series):
    """Zips a series from an *_series() indicator with the candles it
    covers. Those series are always the tail of `candles` (ema_series and
    rsi_series both document `series[-k]` lines up with `values[-k]`), so
    zipping from the end is the correct pairing, not an approximation."""
    if not series:
        return {}
    tail = candles[-len(series) :]
    return {c["open_time"]: v for c, v in zip(tail, series)}


def find(swings, indicator_by_open_time, kind):
    """Divergence between price swings and an indicator's value at those
    same candles.

    `kind` is "high" for a bearish check (price makes a higher high while
    the indicator makes a lower one) or "low" for a bullish one (price makes
    a lower low while the indicator makes a higher one). Only the most
    recent comparable pair is checked — an older divergence has already
    played out or failed to.
    """
    points = [s for s in swings if s["kind"] == kind]
    if len(points) < 2:
        return None

    a, b = points[-2], points[-1]
    value_a = indicator_by_open_time.get(a["open_time"])
    value_b = indicator_by_open_time.get(b["open_time"])
    if value_a is None or value_b is None:
        return None

    if kind == "high" and b["price"] > a["price"] and value_b < value_a:
        return {"kind": "bearish", "at": b["open_time"]}
    if kind == "low" and b["price"] < a["price"] and value_b > value_a:
        return {"kind": "bullish", "at": b["open_time"]}
    return None
