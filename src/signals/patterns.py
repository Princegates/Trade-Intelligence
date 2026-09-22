"""Candlestick pattern detection.

Shape alone is never a signal. A long lower wick after a decline is a hammer
and reads bullish; the identical shape after a rally is a hanging man and
reads bearish. Every detector here is therefore given the prevailing trend
and reports direction from shape *and* context (spec 7.2).

Only closed candles are ever passed in — an incomplete candle's body and
wicks are still moving, so its "pattern" would repaint.
"""

# A doji's body is this fraction of its range at most: the open and close are
# effectively equal, which is indecision rather than direction.
DOJI_BODY_RATIO = 0.1

# A hammer/star's signature wick is at least this many times its body.
WICK_TO_BODY = 2.0

# The opposite wick has to stay small, or the shape is a spinning top.
SMALL_WICK_RATIO = 0.35

# A marubozu-ish "strong" body fills this much of its range.
STRONG_BODY_RATIO = 0.6


def _body(c):
    return abs(c["close"] - c["open"])


def _span(c):
    return c["high"] - c["low"]


def _upper_wick(c):
    return c["high"] - max(c["open"], c["close"])


def _lower_wick(c):
    return min(c["open"], c["close"]) - c["low"]


def _is_bull(c):
    return c["close"] > c["open"]


def _event(name, direction, note):
    return {"name": name, "direction": direction, "note": note}


def _single(candles, trend):
    c = candles[-1]
    span, body = _span(c), _body(c)
    if span <= 0:
        return None

    upper, lower = _upper_wick(c), _lower_wick(c)

    if body <= span * DOJI_BODY_RATIO:
        return _event("Doji", 0, "open and close nearly equal — indecision, not direction")

    if body > 0 and lower >= body * WICK_TO_BODY and upper <= span * SMALL_WICK_RATIO:
        if trend == "down":
            return _event("Hammer", 1, "long lower wick after a decline — sellers pushed down and lost the ground")
        if trend == "up":
            return _event("Hanging Man", -1, "long lower wick after a rally — selling pressure appearing under an uptrend")
        return _event("Hammer-like", 0, "long lower wick, but no clear trend to reverse")

    if body > 0 and upper >= body * WICK_TO_BODY and lower <= span * SMALL_WICK_RATIO:
        if trend == "up":
            return _event("Shooting Star", -1, "long upper wick after a rally — buyers pushed up and lost the ground")
        if trend == "down":
            return _event("Inverted Hammer", 1, "long upper wick after a decline — buyers testing higher")
        return _event("Star-like", 0, "long upper wick, but no clear trend to reverse")

    return None


def _two(candles, trend):
    prev, cur = candles[-2], candles[-1]
    if _body(prev) <= 0 or _body(cur) <= 0:
        return None

    engulfs = max(cur["open"], cur["close"]) >= max(prev["open"], prev["close"]) and min(
        cur["open"], cur["close"]
    ) <= min(prev["open"], prev["close"])

    if engulfs and _is_bull(cur) and not _is_bull(prev) and trend != "up":
        return _event("Bullish Engulfing", 1, "an up candle swallowing the previous down candle")
    if engulfs and not _is_bull(cur) and _is_bull(prev) and trend != "down":
        return _event("Bearish Engulfing", -1, "a down candle swallowing the previous up candle")

    return None


def _three(candles, trend):
    a, b, c = candles[-3], candles[-2], candles[-1]

    small_middle = _body(b) < _body(a) * 0.6 and _body(b) < _body(c) * 0.6

    if small_middle and not _is_bull(a) and _is_bull(c) and c["close"] > (a["open"] + a["close"]) / 2:
        return _event("Morning Star", 1, "a decline, a pause, then a strong recovery")
    if small_middle and _is_bull(a) and not _is_bull(c) and c["close"] < (a["open"] + a["close"]) / 2:
        return _event("Evening Star", -1, "a rally, a pause, then a strong rejection")

    strong = all(_span(x) > 0 and _body(x) >= _span(x) * STRONG_BODY_RATIO for x in (a, b, c))
    if strong and all(_is_bull(x) for x in (a, b, c)) and c["close"] > b["close"] > a["close"]:
        return _event("Three White Soldiers", 1, "three strong up candles in a row, each closing higher")
    if strong and not any(_is_bull(x) for x in (a, b, c)) and c["close"] < b["close"] < a["close"]:
        return _event("Three Black Crows", -1, "three strong down candles in a row, each closing lower")

    return None


def detect(candles, trend):
    """Patterns ending on the most recent (closed) candle.

    `trend` is "up", "down" or "flat" and decides how an ambiguous shape is
    read. Returns the events found, newest-forming first.
    """
    found = []
    if len(candles) >= 3:
        event = _three(candles, trend)
        if event:
            found.append(event)
    if len(candles) >= 2:
        event = _two(candles, trend)
        if event:
            found.append(event)
    if len(candles) >= 1:
        event = _single(candles, trend)
        if event:
            found.append(event)
    return found
