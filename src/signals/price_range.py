"""Range / Premium-Discount engine — context on where current price sits
within a reference high/low range, shared by every strategy (spec: "This
allows the entire system to understand whether price is: Deep discount /
Discount / Equilibrium / Premium / Deep premium").

Pure context, never a verdict on its own — per the spec's own instruction,
"Do not automatically interpret these zones as buy/sell signals." Nothing
here reads a gate or changes a verdict anywhere in the codebase; callers
(src/signals/engine.py, src/signals/setups.py) attach the result as
additional, explainable market-context data alongside whatever their own
rules decide.
"""

DEEP_THRESHOLD_PCT = 10.0
EQUILIBRIUM_HALF_WIDTH_PCT = 5.0


def zone(position_pct, deep_threshold_pct=DEEP_THRESHOLD_PCT, equilibrium_half_width_pct=EQUILIBRIUM_HALF_WIDTH_PCT):
    """DEEP_DISCOUNT / DISCOUNT / EQUILIBRIUM / PREMIUM / DEEP_PREMIUM from a
    position percentage (0 = at the low, 100 = at the high). Can fall
    outside [0, 100] when price has moved past the range since it was
    measured — DEEP_DISCOUNT/DEEP_PREMIUM already cover anything beyond
    the threshold on either side, including negative or >100 values, so
    that case needs no special handling here."""
    if position_pct <= deep_threshold_pct:
        return "DEEP_DISCOUNT"
    if position_pct >= 100 - deep_threshold_pct:
        return "DEEP_PREMIUM"
    if abs(position_pct - 50) <= equilibrium_half_width_pct:
        return "EQUILIBRIUM"
    return "DISCOUNT" if position_pct < 50 else "PREMIUM"


def analyze(high, low, price, deep_threshold_pct=DEEP_THRESHOLD_PCT, equilibrium_half_width_pct=EQUILIBRIUM_HALF_WIDTH_PCT):
    """high/low define the reference range (a confirmed swing leg, a
    session range — whatever the caller considers meaningful); price is
    current price. None for a degenerate range (a missing bound, or
    high <= low) — never guessed.

    position_pct is kept unclamped (its true value, which can go negative
    or past 100 once price has moved beyond the range since it was
    measured) rather than clamped to [0, 100] — clamping would silently
    hide that price broke out of the range entirely, which is itself
    useful context, not noise to hide."""
    if high is None or low is None or high <= low:
        return None
    span = high - low
    midpoint = (high + low) / 2
    position_pct = (price - low) / span * 100
    return {
        "high": high,
        "low": low,
        "range": span,
        "midpoint": midpoint,
        "position_pct": round(position_pct, 1),
        "zone": zone(position_pct, deep_threshold_pct, equilibrium_half_width_pct),
    }
