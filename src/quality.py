"""Data-quality gates (DR-005, DR-007, BR-007).

A verdict computed on impossible or stale prices is worse than no verdict at
all, so both cases suppress publication and leave a reason behind instead.
"""

from . import config


def invalid_candle(candle):
    """The problem with this candle, or None when it is sane."""
    o, h, l, c = candle["open"], candle["high"], candle["low"], candle["close"]

    if min(o, h, l, c) <= 0:
        return f"non-positive price at {candle['open_time']}: O{o} H{h} L{l} C{c}"
    if h < l or h < max(o, c) or l > min(o, c):
        return f"impossible OHLC at {candle['open_time']}: O{o} H{h} L{l} C{c}"
    if candle.get("volume", 0) < 0:
        return f"negative volume at {candle['open_time']}"
    return None


def first_invalid(candles):
    for candle in candles:
        problem = invalid_candle(candle)
        if problem:
            return problem
    return None


def is_stale(latest_open_time, now, timeframe):
    duration = config.TIMEFRAME_SECONDS[timeframe]
    overdue = now - (latest_open_time + duration)
    return overdue > config.STALENESS_INTERVALS * duration


def latest_closed_open_time(now, timeframe):
    """When the most recently closed candle opened.

    Lets a run tell whether the provider could have anything new before
    spending a request on it — a daily candle does not change between two
    polls five minutes apart.
    """
    duration = config.TIMEFRAME_SECONDS[timeframe]
    return (now // duration) * duration - duration
