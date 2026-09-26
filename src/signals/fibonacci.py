"""Fibonacci retracement engine for ALIVEDESTINY.

These levels are never automatic entry points (spec's own instruction) —
they define the price band `setups.py` watches for a valid candlestick
confirmation inside, nothing more. `retracement_zone()` is deliberately
shaped to return the same two keys `entry_zone.entry_zone()` does
(`inside_zone`, `distance_atr`), so `entry_zone.distance_exceeds()` works
against it unmodified even though the zone itself — two independent real
retracement prices, not one level plus a symmetric ATR half-width — needs
its own construction here.
"""


def levels(impulse_start, impulse_end, direction):
    """The four retracement prices for the leg impulse_start -> impulse_end.
    `direction` 1 for a bullish impulse (retracement measured DOWN from the
    high), -1 for bearish (retracement measured UP from the low)."""
    span = abs(impulse_end - impulse_start)
    sign = -1 if direction == 1 else 1
    return {
        "fib_50": impulse_end + sign * span * 0.5,
        "fib_61_8": impulse_end + sign * span * 0.618,
        "fib_72": impulse_end + sign * span * 0.72,
        "fib_78_6": impulse_end + sign * span * 0.786,
    }


def retracement_zone(fib_levels, price, atr_val):
    """The 50%-78.6% band as {preferred_entry, zone_low, zone_high,
    inside_zone, distance_atr} — the same shape entry_zone.entry_zone()
    returns, so entry_zone.distance_exceeds() works on it unmodified.
    None without ATR, since distance_atr can't be measured."""
    if atr_val is None or atr_val <= 0:
        return None
    zone_low = min(fib_levels["fib_50"], fib_levels["fib_78_6"])
    zone_high = max(fib_levels["fib_50"], fib_levels["fib_78_6"])
    inside = zone_low <= price <= zone_high
    distance_atr = 0.0 if inside else min(abs(price - zone_low), abs(price - zone_high)) / atr_val
    return {
        "preferred_entry": (zone_low + zone_high) / 2,
        "zone_low": zone_low,
        "zone_high": zone_high,
        "inside_zone": inside,
        "distance_atr": round(distance_atr, 2),
    }


def retracement_quality(impulse_start, impulse_end, price, direction, valid_min=0.5, valid_max=0.786, deep_max=0.886):
    """How far price has retraced back into the impulse leg, as a fraction
    of the impulse's own size (0 = still at the impulse extreme, 1.0 = back
    at the impulse origin):

    SHALLOW  — hasn't reached the minimum retracement yet (still extending
               or barely pulling back).
    VALID    — inside the primary 50%-78.6% zone.
    DEEP     — past 78.6% but not yet a failed structure.
    FAILED   — retraced back through (or near) the impulse's own origin —
               the move that created this setup no longer holds.
    """
    span = abs(impulse_end - impulse_start)
    if span <= 0:
        return "FAILED"

    retraced = (impulse_end - price) if direction == 1 else (price - impulse_end)
    fraction = retraced / span

    if fraction < valid_min:
        return "SHALLOW"
    if fraction <= valid_max:
        return "VALID"
    if fraction <= deep_max:
        return "DEEP"
    return "FAILED"
