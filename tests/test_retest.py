from src.signals import retest


def _candle(open_time, open_, high, low, close):
    return {"open_time": open_time, "open": open_, "high": high, "low": low, "close": close, "volume": 1.0}


def test_confirmed_when_a_bullish_retest_touches_and_holds():
    candles = [
        _candle(0, 105.0, 106.0, 104.0, 105.5),
        _candle(1, 105.5, 105.8, 99.5, 101.0),  # wicks down to the level, closes above it
    ]
    assert retest.structure_retest_confirmed(candles, bos_level=100.0, direction=1) is True


def test_not_confirmed_when_price_never_returns_to_the_level():
    candles = [_candle(0, 108.0, 110.0, 107.0, 109.0)]
    assert retest.structure_retest_confirmed(candles, bos_level=100.0, direction=1) is False


def test_not_confirmed_when_the_touch_closes_back_through_the_level():
    # Touches the level but closes below it — that's a failed retest, not a hold.
    candles = [_candle(0, 101.0, 101.5, 99.0, 99.5)]
    assert retest.structure_retest_confirmed(candles, bos_level=100.0, direction=1) is False


def test_confirmed_when_a_bearish_retest_touches_and_holds():
    candles = [_candle(0, 95.0, 100.5, 94.5, 96.0)]  # wicks up to the level, closes below it
    assert retest.structure_retest_confirmed(candles, bos_level=100.0, direction=-1) is True


def test_only_looks_within_the_given_lookback_window():
    old_touch = _candle(0, 101.0, 101.0, 99.5, 101.0)
    filler = [_candle(i, 105.0, 106.0, 104.0, 105.0) for i in range(1, 6)]
    candles = [old_touch] + filler
    assert retest.structure_retest_confirmed(candles, bos_level=100.0, direction=1, lookback=3) is False
    assert retest.structure_retest_confirmed(candles, bos_level=100.0, direction=1, lookback=10) is True
