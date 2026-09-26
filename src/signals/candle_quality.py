"""Confirmation-candle quality classification for ALIVEDESTINY.

`patterns.detect()` already decides WHETHER a candle is a valid Bullish/
Bearish Engulfing or Morning/Evening Star. This module classifies HOW
convincing one already-detected confirmation candle is, purely from its
own body/range shape — not every confirmation pattern should be treated
as equally strong evidence.
"""


def body_ratio(candle):
    span = candle["high"] - candle["low"]
    if span <= 0:
        return 0.0
    return abs(candle["close"] - candle["open"]) / span


def classify(candle, strong_ratio=0.6, weak_ratio=0.3):
    """STRONG/NORMAL/WEAK from the confirmation candle's own body-to-range
    ratio — a decisive close fills most of its range; an indecisive one
    (long wicks, small body) is weaker evidence even if the pattern shape
    technically matched."""
    ratio = body_ratio(candle)
    if ratio >= strong_ratio:
        return "STRONG"
    if ratio >= weak_ratio:
        return "NORMAL"
    return "WEAK"
