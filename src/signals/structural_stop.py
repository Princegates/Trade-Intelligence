"""Structural stop/target engine for GUDA SPECIAL.

Deliberately its own module rather than an extension of entry_zone.py:
that module's every function is keyed to the confluence engine's own
`nearest_levels()` shape (nearest support/resistance to CURRENT price).
GUDA SPECIAL's stop is anchored to the confirmation-candle FORMATION
itself (spec: "SL = lowest low of the formation" for a Morning Star, "SL =
relevant confirmation structure low" for an Engulfing) — a different,
setup-specific anchor, not "nearest level to price."

Every function here delegates to src/signals/risk_engine.py (the
centralized stop/target module the architecture audit asked for) — kept
here, under their original names, purely so every existing caller/test
keeps working unmodified. The math is identical to before risk_engine.py
existed.
"""

from . import risk_engine as rk


def stop_from_formation(formation_candles, direction, buffer_atr, atr_val, anchor_level=None):
    """`formation_candles` are the 1-3 candles that produced the
    confirmation pattern (the same slice patterns.detect() read). `
    direction` 1 for BUY (stop below the formation's lowest low), -1 for
    SELL (stop above the formation's highest high). None without ATR —
    there's no honest way to size the buffer.

    `anchor_level`, when given, is a structural level the stop must also
    sit beyond — GUDA SPECIAL passes the broken structure level, since a
    break-and-retest trade's thesis only fails once price is back through
    that level. A stop tucked under the formation but above the level
    would get taken out by an ordinary retest wick that never broke the
    thesis at all. See risk_engine.stop_from_formation."""
    return rk.stop_from_formation(formation_candles, direction, buffer_atr, atr_val, anchor_level)


def sanity_check(entry, stop, atr_val, max_risk_distance_atr, min_stop_distance_atr):
    """Whether a computed stop is structurally sensible, before any target
    is even derived from it. Returns (ok, reason) — reason is None when ok.
    Rejects a stop that's inside ordinary noise (too close) or one that's
    unacceptably far (too much risk for one trade). See
    risk_engine.sanity_check."""
    return rk.sanity_check(entry, stop, atr_val, max_risk_distance_atr, min_stop_distance_atr)


def target_from_rr(entry, stop, rr_multiple, direction):
    """TP = entry +/- (risk x rr_multiple), never a fixed pip target. See
    risk_engine.target_from_risk_reward."""
    return rk.target_from_risk_reward(entry, stop, rr_multiple, direction)


def target_conflict(swings, entry, target, direction):
    """Whether a confirmed swing level sits between entry and target that
    could block price before it ever reaches the target. Never moves the
    target to dodge this — callers decide whether to flag or reject. See
    risk_engine.target_conflict."""
    return rk.target_conflict(swings, entry, target, direction)
