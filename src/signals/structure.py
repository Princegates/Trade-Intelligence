"""Market structure, built entirely from OHLC — swing points, trend bias,
and the two events that matter for confluence: a Break of Structure that
continues the trend, and a Change of Character that challenges it.

Nothing here costs a request or a subscription; it is derived from candles
the run already fetched, which is what keeps it in scope for a free build.
"""


def swing_points(candles, lookback=2):
    """Confirmed swing highs/lows: a high (low) that stands strictly above
    (below) every other candle within `lookback` bars on each side.

    The most recent `lookback` candles can never be confirmed yet — a swing
    needs to see what happens after it — so they are excluded rather than
    guessed at. Returns points oldest first.
    """
    points = []
    n = len(candles)
    for i in range(lookback, n - lookback):
        neighbours = [candles[j] for j in range(i - lookback, i + lookback + 1) if j != i]
        high, low = candles[i]["high"], candles[i]["low"]
        if high > max(c["high"] for c in neighbours):
            points.append({"index": i, "open_time": candles[i]["open_time"], "price": high, "kind": "high"})
        if low < min(c["low"] for c in neighbours):
            points.append({"index": i, "open_time": candles[i]["open_time"], "price": low, "kind": "low"})
    return points


def bias(swings):
    """"up", "down" or "range" from the sequence of confirmed swings.

    "up" needs the last two swing highs ascending AND the last two swing
    lows ascending — higher highs and higher lows together. Either alone
    just widens the range; it takes both to call it a trend.
    """
    highs = [s["price"] for s in swings if s["kind"] == "high"]
    lows = [s["price"] for s in swings if s["kind"] == "low"]
    if len(highs) < 2 or len(lows) < 2:
        return "range"

    higher_highs, higher_lows = highs[-1] > highs[-2], lows[-1] > lows[-2]
    lower_highs, lower_lows = highs[-1] < highs[-2], lows[-1] < lows[-2]

    if higher_highs and higher_lows:
        return "up"
    if lower_highs and lower_lows:
        return "down"
    return "range"


def break_of_structure(candles, swings, trend_bias):
    """Whether the latest closed candle broke a level that matters.

    A Break of Structure closes beyond the most recent swing in the
    direction of the prevailing bias — the trend making a new high (or low)
    and continuing. A Change of Character closes beyond the swing *against*
    the bias — the level that was holding the trend up (or down) giving way,
    the first technical sign it may be turning.

    Returns None when the bias is unclear or there is no swing yet to
    measure against.
    """
    if trend_bias not in ("up", "down") or not candles:
        return None

    highs = [s for s in swings if s["kind"] == "high"]
    lows = [s for s in swings if s["kind"] == "low"]
    if not highs or not lows:
        return None

    close = candles[-1]["close"]
    last_high, last_low = highs[-1]["price"], lows[-1]["price"]

    if trend_bias == "up":
        if close > last_high:
            return {"kind": "BOS", "direction": 1, "level": last_high}
        if close < last_low:
            return {"kind": "CHoCH", "direction": -1, "level": last_low}
    else:
        if close < last_low:
            return {"kind": "BOS", "direction": -1, "level": last_low}
        if close > last_high:
            return {"kind": "CHoCH", "direction": 1, "level": last_high}
    return None


def regime(trend_bias, break_event):
    """One label for what price is currently doing (spec section 3).

    A fresh CHoCH is called REVERSING regardless of the old bias — that is
    the whole point of the event. Absent a break, an unclear bias is
    RANGING and an established one is TRENDING, mid-swing.
    """
    if break_event and break_event["kind"] == "CHoCH":
        return "REVERSING"
    if trend_bias == "range":
        return "RANGING"
    return "TRENDING"


def equal_levels(swings, tolerance=0.0015):
    """Clusters of swing highs (or lows) within `tolerance` of each other —
    a level price has tested more than once without breaking, which is
    where stops and pending orders concentrate (a liquidity pool).

    `tolerance` is a fraction of price, so the same check works whether the
    instrument trades in the thousands or the tens of thousands.
    """
    pools = []
    for kind in ("high", "low"):
        points = sorted((s for s in swings if s["kind"] == kind), key=lambda s: s["price"])
        cluster = []
        for point in points:
            if cluster and abs(point["price"] - cluster[-1]["price"]) > cluster[-1]["price"] * tolerance:
                if len(cluster) >= 2:
                    pools.append(_pool(kind, cluster))
                cluster = []
            cluster.append(point)
        if len(cluster) >= 2:
            pools.append(_pool(kind, cluster))
    return pools


def _pool(kind, cluster):
    return {"kind": kind, "price": sum(c["price"] for c in cluster) / len(cluster), "touches": len(cluster)}


def swept(candle, pools):
    """A liquidity sweep: the candle's wick pierced a pooled level but its
    body closed back on the near side — a probe for stops rather than a
    genuine breakout (spec section 13, false breakout / liquidity sweep).
    Returns the pool that was swept, or None.
    """
    for pool in pools:
        level = pool["price"]
        if pool["kind"] == "high" and candle["high"] > level and candle["close"] < level:
            return pool
        if pool["kind"] == "low" and candle["low"] < level and candle["close"] > level:
            return pool
    return None


def nearest_levels(swings, price):
    """Nearest support below and resistance above `price`, from confirmed
    swings — used to judge whether a candlestick pattern formed somewhere
    that actually matters, rather than in the middle of nowhere."""
    below = [s["price"] for s in swings if s["price"] < price]
    above = [s["price"] for s in swings if s["price"] > price]
    return {"support": max(below) if below else None, "resistance": min(above) if above else None}


def near_level(price, level, atr, within=0.5):
    """Whether `price` is within `within` ATRs of `level` — a volatility-
    scaled sense of "meaningful", not an arbitrary fixed distance."""
    if level is None or atr is None or atr <= 0:
        return False
    return abs(price - level) <= atr * within
