from src.signals import confluence


def _candle(t, price, **overrides):
    base = {"open_time": t, "open": price - 0.1, "high": price + 0.3, "low": price - 0.3, "close": price + 0.1, "volume": 1.0}
    return {**base, **overrides}


def _zigzag(prices):
    """One candle per price, small wick either side — same shape
    test_structure.py's own fixtures use, since swing_points() needs a
    genuine local peak/trough (strictly beyond every neighbor within the
    lookback window), not just a net-directional ramp."""
    return [_candle(i, p) for i, p in enumerate(prices)]


# Ascending peaks (110.3, 120.3, 130.3) and troughs (99.7, 103.7) — higher
# highs and higher lows, the shape structure.bias() reads as "up". Needs to
# be long enough for swing_points(lookback=2) to confirm at least two highs
# and two lows, which a short zigzag doesn't reliably produce.
ZIGZAG_UP = [100, 105, 110, 105, 100, 110, 120, 112, 104, 115, 130, 121, 112]

# Mirror image (220 - x for each x above): descending peaks, lower lows.
ZIGZAG_DOWN = [220 - p for p in ZIGZAG_UP]


def test_no_candles_returns_no_bias():
    assert confluence.higher_timeframe_bias(None) is None
    assert confluence.higher_timeframe_bias([]) is None


def test_too_little_history_returns_no_bias():
    assert confluence.higher_timeframe_bias(_zigzag(ZIGZAG_UP[:4])) is None


def test_an_uptrend_reads_as_up_bias():
    assert confluence.higher_timeframe_bias(_zigzag(ZIGZAG_UP)) == "up"


def test_a_downtrend_reads_as_down_bias():
    assert confluence.higher_timeframe_bias(_zigzag(ZIGZAG_DOWN)) == "down"


def test_opposes_vetoes_a_buy_against_a_down_bias():
    assert confluence.opposes("BUY", "down") is True


def test_opposes_vetoes_a_sell_against_an_up_bias():
    assert confluence.opposes("SELL", "up") is True


def test_opposes_never_vetoes_agreement():
    assert confluence.opposes("BUY", "up") is False
    assert confluence.opposes("SELL", "down") is False


def test_opposes_never_vetoes_range_or_unknown_bias():
    assert confluence.opposes("BUY", "range") is False
    assert confluence.opposes("BUY", None) is False
    assert confluence.opposes("SELL", "range") is False
    assert confluence.opposes("SELL", None) is False


def test_opposes_is_always_false_for_a_hold():
    assert confluence.opposes("HOLD", "up") is False
    assert confluence.opposes("HOLD", "down") is False


def test_anchor_timeframe_map_has_no_anchor_above_1d():
    assert confluence.ANCHOR_TIMEFRAME["1d"] is None
    assert confluence.ANCHOR_TIMEFRAME["1h"] == "1d"
    assert confluence.ANCHOR_TIMEFRAME["5m"] == "1h"
