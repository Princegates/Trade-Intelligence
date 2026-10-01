"""Multi-level volatility classification, shared by every strategy — the
capability the architecture audit found missing from both the confluence
engine and GUDA SPECIAL (only a binary spike veto and an unlabeled ratio
gate existed anywhere in the codebase).

Distinct from, and changes the behavior of neither, the two volatility
checks already in src/signals/engine.py: the binary abnormal-candle-range
spike veto (engine._volatility, always on) and the optional
max_atr_ratio/min_atr_ratio HOLD gates (admin-configured, off by default).
This module only adds a named classification alongside those, for
strategies/UI/position-sizing to read — it is never itself a gate, and no
existing gate's behavior changes because this module exists.

Thresholds are expressed as a ratio of current ATR to a longer-run
baseline ATR (engine.py's own ATR_BASELINE_PERIOD, 100 candles by
default) — the same ratio engine.py already computes for its optional
atr_ratio gates, read here into a named bucket instead of a raw number.
"""

LOW_MAX = 0.7
HIGH_MIN = 1.5
EXTREME_MIN = 2.5


def classify(atr_val, baseline_atr_val, low_max=LOW_MAX, high_min=HIGH_MIN, extreme_min=EXTREME_MIN):
    """LOW/NORMAL/HIGH/EXTREME from current ATR against a longer-run
    baseline ATR. None when either ATR is unavailable — never guessed."""
    if atr_val is None or baseline_atr_val is None or baseline_atr_val <= 0:
        return None
    ratio = atr_val / baseline_atr_val
    if ratio >= extreme_min:
        return "EXTREME"
    if ratio >= high_min:
        return "HIGH"
    if ratio <= low_max:
        return "LOW"
    return "NORMAL"
