"""Structural stop/target engine for GUDA SPECIAL.

Deliberately its own module rather than an extension of entry_zone.py:
that module's every function is keyed to the confluence engine's own
`nearest_levels()` shape (nearest support/resistance to CURRENT price).
GUDA SPECIAL's stop is anchored to the confirmation-candle FORMATION
itself (spec: "SL = lowest low of the formation" for a Morning Star, "SL =
relevant confirmation structure low" for an Engulfing) — a different,
setup-specific anchor, not "nearest level to price."
"""


def stop_from_formation(formation_candles, direction, buffer_atr, atr_val):
    """`formation_candles` are the 1-3 candles that produced the
    confirmation pattern (the same slice patterns.detect() read). `
    direction` 1 for BUY (stop below the formation's lowest low), -1 for
    SELL (stop above the formation's highest high). None without ATR —
    there's no honest way to size the buffer."""
    if atr_val is None or atr_val <= 0:
        return None
    buffer = atr_val * buffer_atr
    if direction == 1:
        return min(c["low"] for c in formation_candles) - buffer
    return max(c["high"] for c in formation_candles) + buffer


def sanity_check(entry, stop, atr_val, max_risk_distance_atr, min_stop_distance_atr):
    """Whether a computed stop is structurally sensible, before any target
    is even derived from it. Returns (ok, reason) — reason is None when ok.
    Rejects a stop that's inside ordinary noise (too close) or one that's
    unacceptably far (too much risk for one trade)."""
    if atr_val is None or atr_val <= 0:
        return False, "no ATR available to size the stop"
    risk_atr = abs(entry - stop) / atr_val
    if risk_atr < min_stop_distance_atr:
        return False, f"stop is only {risk_atr:.2f} ATR away — inside normal noise"
    if risk_atr > max_risk_distance_atr:
        return False, f"stop is {risk_atr:.2f} ATR away — too far for an acceptable risk"
    return True, None


def target_from_rr(entry, stop, rr_multiple, direction):
    """TP = entry +/- (risk x rr_multiple), never a fixed pip target."""
    risk = abs(entry - stop)
    return entry + risk * rr_multiple if direction == 1 else entry - risk * rr_multiple


def target_conflict(swings, entry, target, direction):
    """Whether a confirmed swing level sits between entry and target that
    could block price before it ever reaches the target. Never moves the
    target to dodge this — callers decide whether to flag or reject."""
    lo, hi = (entry, target) if entry < target else (target, entry)
    return any(lo < s["price"] < hi for s in swings)
