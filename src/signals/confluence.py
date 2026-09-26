"""Cross-timeframe confluence: does a higher timeframe's own market
structure agree with, oppose, or say nothing about this timeframe's call?

Deliberately reuses structure.py's existing swing/bias machinery rather than
introducing a second trend-detection method — one higher-timeframe bias
read, not a second EMA stack or a second momentum vote, so this stays a
single well-understood signal rather than a second engine bolted onto the
first.
"""

from . import structure as struct

# Each timeframe checks against exactly one higher "anchor" timeframe, not
# the whole stack above it — a single well-chosen rung is enough to catch
# "fighting the higher-timeframe trend" without turning this into an
# N-timeframe weighted combination (that already exists, display-only, in
# web/src/lib/consensus.ts, and duplicating its judgment call inside the
# engine is a separate, larger design decision — not taken here).
ANCHOR_TIMEFRAME = {
    "5m": "1h",
    "15m": "4h",
    "1h": "1d",
    "4h": "1d",
    "1d": None,  # nothing higher is fetched for this project
}


def higher_timeframe_bias(candles, lookback=2):
    """"up" / "down" / "range", or None with too little history — the same
    three-way read structure.bias() already produces, just applied to a
    different timeframe's candles. Never raises on short/missing history;
    degrades to None exactly like every other category in engine.py does.
    """
    if not candles:
        return None
    swings = struct.swing_points(candles, lookback)
    highs = [s for s in swings if s["kind"] == "high"]
    lows = [s for s in swings if s["kind"] == "low"]
    if len(highs) < 2 or len(lows) < 2:
        return None
    return struct.bias(swings)


def opposes(verdict, bias):
    """Whether the higher timeframe's bias actively contradicts `verdict`.
    Agreement, "range", or None (no data) are never a veto — absence of
    confirming context is not evidence against a call, only active
    disagreement is (the same asymmetry as every other gate in engine.py).
    """
    if verdict == "BUY":
        return bias == "down"
    if verdict == "SELL":
        return bias == "up"
    return False
