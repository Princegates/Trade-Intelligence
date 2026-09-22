from src.signals import divergence


def candle(t, close):
    return {"open_time": t, "open": close, "high": close, "low": close, "close": close, "volume": 1.0}


def _swing(open_time, price, kind):
    return {"index": 0, "open_time": open_time, "price": price, "kind": kind}


def test_align_zips_a_tail_series_to_the_matching_candles():
    candles = [candle(t, 100 + t) for t in range(10)]
    series = [1.0, 2.0, 3.0]  # aligns to the last 3 candles: t=7,8,9
    aligned = divergence.align(candles, series)
    assert aligned == {7: 1.0, 8: 2.0, 9: 3.0}


def test_align_empty_series_gives_empty_map():
    candles = [candle(0, 100)]
    assert divergence.align(candles, []) == {}


def test_bearish_divergence_price_higher_high_indicator_lower_high():
    swings = [_swing(0, 100.0, "high"), _swing(1, 105.0, "high")]
    indicator = {0: 70.0, 1: 60.0}  # RSI falling while price rises
    result = divergence.find(swings, indicator, "high")
    assert result == {"kind": "bearish", "at": 1}


def test_bullish_divergence_price_lower_low_indicator_higher_low():
    swings = [_swing(0, 100.0, "low"), _swing(1, 95.0, "low")]
    indicator = {0: 30.0, 1: 40.0}  # RSI rising while price falls
    result = divergence.find(swings, indicator, "low")
    assert result == {"kind": "bullish", "at": 1}


def test_no_divergence_when_price_and_indicator_agree():
    swings = [_swing(0, 100.0, "high"), _swing(1, 105.0, "high")]
    indicator = {0: 60.0, 1: 70.0}  # both rising — confirming, not diverging
    assert divergence.find(swings, indicator, "high") is None


def test_none_without_two_comparable_swings():
    swings = [_swing(0, 100.0, "high")]
    assert divergence.find(swings, {0: 60.0}, "high") is None


def test_none_when_the_indicator_value_is_missing():
    swings = [_swing(0, 100.0, "high"), _swing(1, 105.0, "high")]
    assert divergence.find(swings, {0: 60.0}, "high") is None  # index 1 missing


def test_low_kind_ignores_high_swings_and_vice_versa():
    swings = [_swing(0, 100.0, "high"), _swing(1, 105.0, "high")]
    assert divergence.find(swings, {0: 60.0, 1: 50.0}, "low") is None
