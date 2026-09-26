"""Structure-retest validation for ALIVEDESTINY.

Touching the Fibonacci band is not, on its own, evidence the broken
structure level is holding as new support/resistance — that requires price
to have actually revisited the level and closed back on the trend side,
not just passed through the Fib band on its way past it. Nothing in
structure.py checks a level being revisited-and-held after a break; this
is the one new primitive that does.
"""


def structure_retest_confirmed(candles, bos_level, direction, lookback=5):
    """Whether the broken level has been revisited and held, within the
    most recent `lookback` (closed) candles: a candle's wick reached back
    to `bos_level` (or through it) while its close stayed on the trend
    side — the level acting as support (bullish) or resistance (bearish).
    Only looks at already-closed candles, so this never depends on
    anything not yet known."""
    recent = candles[-lookback:] if len(candles) >= lookback else candles
    for c in recent:
        if direction == 1:
            touched = c["low"] <= bos_level
            held = c["close"] >= bos_level
        else:
            touched = c["high"] >= bos_level
            held = c["close"] <= bos_level
        if touched and held:
            return True
    return False
