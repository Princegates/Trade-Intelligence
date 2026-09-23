from src.signals import patterns


def candle(open_, high, low, close):
    return {"open_time": 0, "open": open_, "high": high, "low": low, "close": close, "volume": 1.0}


def _filler(n, price=100.0):
    """Unremarkable candles: a real body, short wicks, nothing to detect."""
    return [candle(price - 0.3, price + 0.1, price - 0.4, price) for _ in range(n)]


def names(events):
    return [e["name"] for e in events]


def find(events, name):
    return next(e for e in events if e["name"] == name)


# The point of the module: identical shapes mean opposite things depending on
# what came before them.
HAMMER = candle(open_=104.0, high=105.0, low=96.0, close=105.0)


def test_long_lower_wick_after_a_decline_is_a_bullish_hammer():
    event = find(patterns.detect(_filler(2) + [HAMMER], trend="down"), "Hammer")
    assert event["direction"] == 1


def test_the_same_shape_after_a_rally_is_a_bearish_hanging_man():
    event = find(patterns.detect(_filler(2) + [HAMMER], trend="up"), "Hanging Man")
    assert event["direction"] == -1


def test_the_same_shape_with_no_trend_calls_no_direction():
    event = find(patterns.detect(_filler(2) + [HAMMER], trend="flat"), "Hammer-like")
    assert event["direction"] == 0


# Body big enough not to read as a doji, with the wick well above it.
STAR = candle(open_=100.0, high=109.0, low=99.6, close=101.5)


def test_long_upper_wick_after_a_rally_is_a_bearish_shooting_star():
    assert find(patterns.detect(_filler(2) + [STAR], trend="up"), "Shooting Star")["direction"] == -1


def test_long_upper_wick_after_a_decline_is_a_bullish_inverted_hammer():
    assert find(patterns.detect(_filler(2) + [STAR], trend="down"), "Inverted Hammer")["direction"] == 1


def test_a_doji_reports_indecision_rather_than_a_direction():
    doji = candle(open_=100.0, high=103.0, low=97.0, close=100.05)
    assert find(patterns.detect(_filler(2) + [doji], trend="up"), "Doji")["direction"] == 0


def test_bullish_engulfing_needs_the_up_candle_to_swallow_the_down_one():
    down = candle(open_=104.0, high=104.5, low=101.5, close=102.0)
    up = candle(open_=101.0, high=106.0, low=100.5, close=105.0)
    assert find(patterns.detect(_filler(1) + [down, up], trend="down"), "Bullish Engulfing")["direction"] == 1


def test_bearish_engulfing_is_the_mirror_image():
    up = candle(open_=102.0, high=104.5, low=101.5, close=104.0)
    down = candle(open_=105.0, high=106.0, low=100.5, close=101.0)
    assert find(patterns.detect(_filler(1) + [up, down], trend="up"), "Bearish Engulfing")["direction"] == -1


def test_an_engulfing_body_that_does_not_cover_the_previous_one_is_not_a_pattern():
    down = candle(open_=106.0, high=106.5, low=100.0, close=101.0)
    up = candle(open_=102.0, high=104.0, low=101.5, close=103.0)  # inside the previous body
    assert "Bullish Engulfing" not in names(patterns.detect(_filler(1) + [down, up], trend="down"))


def test_morning_star_is_a_decline_a_pause_then_a_recovery():
    drop = candle(open_=110.0, high=110.5, low=99.5, close=100.0)
    pause = candle(open_=99.5, high=100.5, low=99.0, close=99.8)
    rally = candle(open_=100.0, high=109.0, low=99.8, close=108.0)
    assert find(patterns.detect([drop, pause, rally], trend="down"), "Morning Star")["direction"] == 1


def test_evening_star_is_the_mirror_image():
    rally = candle(open_=100.0, high=110.5, low=99.5, close=110.0)
    pause = candle(open_=110.2, high=111.0, low=109.8, close=110.5)
    drop = candle(open_=110.0, high=110.5, low=100.5, close=101.0)
    assert find(patterns.detect([rally, pause, drop], trend="up"), "Evening Star")["direction"] == -1


def test_three_white_soldiers_need_three_strong_rising_closes():
    a = candle(open_=100.0, high=104.2, low=99.9, close=104.0)
    b = candle(open_=104.0, high=108.2, low=103.9, close=108.0)
    c = candle(open_=108.0, high=112.2, low=107.9, close=112.0)
    assert find(patterns.detect([a, b, c], trend="up"), "Three White Soldiers")["direction"] == 1


def test_three_black_crows_are_the_mirror_image():
    a = candle(open_=112.0, high=112.1, low=107.8, close=108.0)
    b = candle(open_=108.0, high=108.1, low=103.8, close=104.0)
    c = candle(open_=104.0, high=104.1, low=99.8, close=100.0)
    assert find(patterns.detect([a, b, c], trend="down"), "Three Black Crows")["direction"] == -1


def test_ordinary_candles_produce_no_pattern():
    assert patterns.detect(_filler(5), trend="up") == []


def test_detection_survives_a_flat_candle_without_dividing_by_zero():
    flat = candle(open_=100.0, high=100.0, low=100.0, close=100.0)
    assert patterns.detect(_filler(2) + [flat], trend="up") == []
