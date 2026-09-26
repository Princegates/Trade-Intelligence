"""Break classification and impulse measurement for GUDA SPECIAL.

`structure.break_of_structure()` already enforces "a wick alone doesn't
qualify" (it only fires on a closed candle's close, never a high/low) — so
what's added here is (1) a strength read of a break that DID qualify, from
the break candle's own body/range character and how far its close cleared
the level, and (2) the impulse leg the break belongs to: the most recent
opposing swing through to the extreme reached since. Whether a "confirmed"
break later fails (price closes back through the level) is checked on
SUBSEQENT candles by `single_level_swept()`, in `setups.py`'s advance
pass — not here, since that can only be known after the fact and doing it
at detection time would be look-ahead bias.
"""


def classify_break(break_candle, level, atr_val, strong_body_ratio=0.6, strong_break_atr=0.3, weak_body_ratio=0.3):
    """STRONG/NORMAL/WEAK, from the break candle's body-to-range ratio
    (a decisive close, not just a graze) and how far its close cleared the
    broken level, in ATRs. WEAK is not disqualifying on its own — it's
    diagnostic input for the setup's eventual confidence read, same as
    every other quality classification here."""
    span = break_candle["high"] - break_candle["low"]
    body = abs(break_candle["close"] - break_candle["open"])
    body_ratio = body / span if span > 0 else 0.0

    if atr_val is None or atr_val <= 0:
        return "NORMAL"

    break_distance_atr = abs(break_candle["close"] - level) / atr_val

    if body_ratio >= strong_body_ratio and break_distance_atr >= strong_break_atr:
        return "STRONG"
    if body_ratio >= weak_body_ratio:
        return "NORMAL"
    return "WEAK"


def single_level_swept(candle, level, direction):
    """Whether `candle` has closed back through `level`, undoing a break
    that continued in `direction` (1 for a bullish/upward break, -1 for
    bearish/downward). Unlike `structure.swept()`, which scans a pool of
    multi-touch levels, this checks one specific already-broken level — a
    freshly broken swing is a single point, not (yet) a pool. Evaluated on
    each run's newest candle against an open setup's own stored break
    level, so a break that looked good can still be invalidated a few
    candles later without ever needing to know that in advance."""
    if direction == 1:
        return candle["close"] < level
    return candle["close"] > level


def measure_impulse(candles, swings, direction):
    """The leg from the most recent opposing confirmed swing (the origin
    of the move) through to the extreme price reached since, in the break
    direction. `direction` 1 looks for the most recent swing LOW as the
    origin and the highest high since; -1 the mirror. None if no opposing
    swing exists yet to measure from."""
    opposite_kind = "low" if direction == 1 else "high"
    opposing = [s for s in swings if s["kind"] == opposite_kind]
    if not opposing:
        return None

    origin = opposing[-1]
    window = [c for c in candles if c["open_time"] >= origin["open_time"]]
    if not window:
        return None

    if direction == 1:
        extreme = max(c["high"] for c in window)
    else:
        extreme = min(c["low"] for c in window)

    return {"start_price": origin["price"], "end_price": extreme}


def impulse_clears_minimum(impulse, atr_val, min_atr_multiple):
    """Whether the impulse leg is large enough, relative to ATR, to be a
    real displacement rather than noise (spec's minimum-impulse filter).
    False (never passes) when there's no impulse or no ATR to measure
    against — an insignificant or unmeasurable move earns no setup."""
    if impulse is None or atr_val is None or atr_val <= 0:
        return False
    size = abs(impulse["end_price"] - impulse["start_price"])
    return (size / atr_val) >= min_atr_multiple
