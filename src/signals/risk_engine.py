"""Centralized stop/target/risk calculations — the single source of truth
the architecture audit found missing: src/signals/entry_zone.py (the
confluence engine's nearest-level anchor) and src/signals/
structural_stop.py (GUDA SPECIAL's confirmation-formation anchor) were two
fully independent implementations of conceptually similar risk math, with
the `target = entry +/- risk * rr_multiple` formula alone written out
independently in three separate places across the codebase.

Both anchor strategies are kept, unchanged, as two explicit functions
here — the audit confirmed each strategy's own anchor choice is
deliberate, not an accident worth collapsing into one:

- `stop_from_nearest_level` anchors to the nearest confirmed swing level
  to CURRENT PRICE (the confluence engine's choice — a stop that moves
  with where price is now).
- `stop_from_formation` anchors to the confirmation-candle FORMATION's own
  high/low, optionally widened by a structural level the setup's thesis
  depends on holding (GUDA SPECIAL's choice — a stop tied to the specific
  pattern that triggered the trade, not to current price).

What centralizes here is the CODE, not the decision: entry_zone.py and
structural_stop.py now both delegate to this module and keep their
original public functions/signatures unchanged, so neither engine.py nor
setups.py needed a single call-site change for this — every number either
module produces is byte-for-byte identical to before this module existed.
"""


def stop_from_nearest_level(side, price, levels, atr_val, buffer_atr):
    """Confluence engine's anchor. `levels` is the dict returned by
    structure.nearest_levels() — {"support": ..., "resistance": ...}.
    None when there's no level on that side yet or ATR is unavailable —
    the caller's ATR-fixed-ratio fallback takes over."""
    if atr_val is None or atr_val <= 0:
        return None
    level = levels.get(side)
    if level is None:
        return None
    buffer = atr_val * buffer_atr
    return level - buffer if side == "support" else level + buffer


def target_from_nearest_level(side, levels):
    """The opposing structural level — deliberately NOT a multiple of the
    stop distance, so risk/reward genuinely varies per signal instead of
    being fixed by settings alone."""
    opposite = "resistance" if side == "support" else "support"
    return levels.get(opposite)


def stop_from_formation(formation_candles, direction, buffer_atr, atr_val, anchor_level=None):
    """GUDA SPECIAL's anchor. `formation_candles` are the 1-3 candles that
    produced the confirmation pattern. `direction` 1 for BUY (stop below
    the formation's lowest low), -1 for SELL (stop above the formation's
    highest high). `anchor_level`, when given, is a structural level the
    stop must also sit beyond — a break-and-retest trade's thesis only
    fails once price is back through the level it broke, so a stop tucked
    under the formation but above that level would get taken out by an
    ordinary retest wick that never broke the thesis at all. None without
    ATR — there's no honest way to size the buffer."""
    if atr_val is None or atr_val <= 0:
        return None
    buffer = atr_val * buffer_atr
    if direction == 1:
        extreme = min(c["low"] for c in formation_candles)
        if anchor_level is not None:
            extreme = min(extreme, anchor_level)
        return extreme - buffer
    extreme = max(c["high"] for c in formation_candles)
    if anchor_level is not None:
        extreme = max(extreme, anchor_level)
    return extreme + buffer


def target_from_risk_reward(entry, stop, rr_multiple, direction):
    """TP = entry +/- (risk x rr_multiple), never a fixed pip target — the
    one formula every caller across the codebase needs, centralized here
    as the single source of truth rather than written out independently
    wherever a target is derived from risk."""
    risk = abs(entry - stop)
    return entry + risk * rr_multiple if direction == 1 else entry - risk * rr_multiple


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


def target_conflict(swings, entry, target, direction):
    """Whether a confirmed swing level sits between entry and target that
    could block price before it ever reaches the target. Never moves the
    target to dodge this — callers decide whether to flag or reject."""
    lo, hi = (entry, target) if entry < target else (target, entry)
    return any(lo < s["price"] < hi for s in swings)
