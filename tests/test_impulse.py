from src.signals import impulse


def _candle(open_time, open_, high, low, close):
    return {"open_time": open_time, "open": open_, "high": high, "low": low, "close": close, "volume": 1.0}


# --- classify_break -------------------------------------------------------


def test_classify_break_is_strong_with_a_decisive_body_and_clear_break():
    candle = _candle(0, 100.0, 106.0, 99.5, 105.5)  # body 5.5, span 6.5, ratio ~0.85
    assert impulse.classify_break(candle, level=100.0, atr_val=2.0) == "STRONG"


def test_classify_break_is_weak_with_a_small_body():
    candle = _candle(0, 100.0, 106.0, 99.0, 100.5)  # body 0.5, span 7.0, ratio ~0.07
    assert impulse.classify_break(candle, level=100.0, atr_val=2.0) == "WEAK"


def test_classify_break_is_normal_with_a_moderate_body():
    candle = _candle(0, 100.0, 103.0, 99.5, 101.5)  # body 1.5, span 3.5, ratio ~0.43
    assert impulse.classify_break(candle, level=100.0, atr_val=2.0) == "NORMAL"


def test_classify_break_needs_both_body_and_break_distance_for_strong():
    # Strong body ratio but the close barely cleared the level (break_distance_atr small).
    candle = _candle(0, 99.0, 100.3, 98.8, 100.1)  # body 1.1, span 1.5, ratio ~0.73; break dist 0.1/2.0=0.05
    assert impulse.classify_break(candle, level=100.0, atr_val=2.0) == "NORMAL"


def test_classify_break_defaults_to_normal_without_atr():
    candle = _candle(0, 100.0, 106.0, 99.5, 105.5)
    assert impulse.classify_break(candle, level=100.0, atr_val=None) == "NORMAL"
    assert impulse.classify_break(candle, level=100.0, atr_val=0) == "NORMAL"


# --- single_level_swept -----------------------------------------------------


def test_single_level_swept_true_when_a_bullish_break_closes_back_below():
    candle = _candle(0, 101.0, 101.5, 99.0, 99.5)
    assert impulse.single_level_swept(candle, level=100.0, direction=1) is True


def test_single_level_swept_false_when_a_bullish_break_holds():
    candle = _candle(0, 101.0, 102.0, 100.5, 101.8)
    assert impulse.single_level_swept(candle, level=100.0, direction=1) is False


def test_single_level_swept_true_when_a_bearish_break_closes_back_above():
    candle = _candle(0, 99.0, 101.0, 98.5, 100.5)
    assert impulse.single_level_swept(candle, level=100.0, direction=-1) is True


def test_single_level_swept_false_when_a_bearish_break_holds():
    candle = _candle(0, 99.0, 99.5, 97.0, 97.5)
    assert impulse.single_level_swept(candle, level=100.0, direction=-1) is False


# --- measure_impulse ---------------------------------------------------------


def _swing(open_time, price, kind):
    return {"index": 0, "open_time": open_time, "price": price, "kind": kind}


def test_measure_impulse_finds_the_most_recent_opposing_swing_and_the_extreme():
    swings = [_swing(0, 90.0, "low"), _swing(100, 95.0, "high"), _swing(200, 92.0, "low")]
    candles = [
        _candle(200, 92.0, 93.0, 91.5, 92.5),
        _candle(300, 92.5, 98.0, 92.0, 97.5),  # new high of 98
        _candle(400, 97.5, 99.0, 97.0, 98.8),  # newer high of 99
    ]
    result = impulse.measure_impulse(candles, swings, direction=1)
    assert result == {"start_price": 92.0, "end_price": 99.0}


def test_measure_impulse_mirrors_for_a_bearish_direction():
    swings = [_swing(0, 110.0, "high"), _swing(200, 108.0, "high")]
    candles = [
        _candle(200, 108.0, 108.5, 106.0, 106.5),
        _candle(300, 106.5, 107.0, 103.0, 103.5),  # new low of 103
    ]
    result = impulse.measure_impulse(candles, swings, direction=-1)
    assert result == {"start_price": 108.0, "end_price": 103.0}


def test_measure_impulse_is_none_without_an_opposing_swing():
    swings = [_swing(0, 95.0, "high")]  # no low swing at all
    candles = [_candle(0, 94.0, 96.0, 93.0, 95.5)]
    assert impulse.measure_impulse(candles, swings, direction=1) is None


# --- impulse_clears_minimum ---------------------------------------------------


def test_impulse_clears_minimum_true_when_large_enough():
    impulse_leg = {"start_price": 90.0, "end_price": 99.0}  # size 9
    assert impulse.impulse_clears_minimum(impulse_leg, atr_val=2.0, min_atr_multiple=3.0) is True  # 4.5 ATR


def test_impulse_clears_minimum_false_when_too_small():
    impulse_leg = {"start_price": 90.0, "end_price": 91.0}  # size 1
    assert impulse.impulse_clears_minimum(impulse_leg, atr_val=2.0, min_atr_multiple=3.0) is False  # 0.5 ATR


def test_impulse_clears_minimum_false_without_impulse_or_atr():
    impulse_leg = {"start_price": 90.0, "end_price": 99.0}
    assert impulse.impulse_clears_minimum(None, atr_val=2.0, min_atr_multiple=3.0) is False
    assert impulse.impulse_clears_minimum(impulse_leg, atr_val=None, min_atr_multiple=3.0) is False
    assert impulse.impulse_clears_minimum(impulse_leg, atr_val=0, min_atr_multiple=3.0) is False
