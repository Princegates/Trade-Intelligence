from src.signals import structure


def candle(open_, high, low, close, t=0):
    return {"open_time": t, "open": open_, "high": high, "low": low, "close": close, "volume": 1.0}


def _zigzag(prices):
    """One candle per price, with a small wick either side so high/low are
    distinct from open/close — enough to exercise swing detection without
    a pattern accidentally firing."""
    return [candle(p - 0.1, p + 0.3, p - 0.3, p + 0.1, t=i) for i, p in enumerate(prices)]


# A clean up-down-up-down zigzag: swing highs at 110 and 120, swing lows at
# 100 and 105 (index positions 2, 6, 4 excluded from ends by lookback=2).
ZIGZAG_UP = [100, 105, 110, 105, 100, 110, 120, 112, 104]


def test_swing_points_finds_interior_highs_and_lows():
    swings = structure.swing_points(_zigzag(ZIGZAG_UP), lookback=2)
    highs = [s["price"] for s in swings if s["kind"] == "high"]
    lows = [s["price"] for s in swings if s["kind"] == "low"]
    # Highs/lows carry the wick, i.e. price + 0.3 / price - 0.3.
    assert 110.3 in highs  # the peak at index 2
    assert 120.3 in highs  # the peak at index 6
    assert 99.7 in lows  # the trough at index 4


def test_swing_points_excludes_unconfirmed_edges():
    # The first and last `lookback` candles can never be confirmed.
    swings = structure.swing_points(_zigzag(ZIGZAG_UP), lookback=2)
    assert all(2 <= s["index"] < len(ZIGZAG_UP) - 2 for s in swings)


def test_monotonic_series_has_no_swings():
    rising = _zigzag([100 + i for i in range(20)])
    assert structure.swing_points(rising, lookback=2) == []


def _swing(index, price, kind):
    return {"index": index, "open_time": index, "price": price, "kind": kind}


def test_bias_up_needs_higher_highs_and_higher_lows():
    swings = [_swing(0, 100, "low"), _swing(1, 110, "high"), _swing(2, 105, "low"), _swing(3, 120, "high")]
    assert structure.bias(swings) == "up"


def test_bias_down_needs_lower_highs_and_lower_lows():
    swings = [_swing(0, 120, "high"), _swing(1, 100, "low"), _swing(2, 110, "high"), _swing(3, 90, "low")]
    assert structure.bias(swings) == "down"


def test_bias_is_range_when_highs_and_lows_disagree():
    # Higher high but lower low: a wider range, not a trend.
    swings = [_swing(0, 100, "low"), _swing(1, 110, "high"), _swing(2, 90, "low"), _swing(3, 120, "high")]
    assert structure.bias(swings) == "range"


def test_bias_is_range_without_enough_swings():
    assert structure.bias([_swing(0, 100, "low"), _swing(1, 110, "high")]) == "range"


def test_bos_confirms_the_prevailing_uptrend():
    swings = [_swing(0, 100, "low"), _swing(1, 110, "high"), _swing(2, 105, "low")]
    candles = [candle(0, 0, 0, 111, t=99)]  # closes above the last swing high, 110
    event = structure.break_of_structure(candles, swings, "up")
    assert event == {"kind": "BOS", "direction": 1, "level": 110}


def test_choch_challenges_an_uptrend():
    swings = [_swing(0, 100, "low"), _swing(1, 110, "high"), _swing(2, 105, "low")]
    candles = [candle(0, 0, 0, 99, t=99)]  # closes below the last swing low, 105
    event = structure.break_of_structure(candles, swings, "up")
    assert event == {"kind": "CHoCH", "direction": -1, "level": 105}


def test_no_break_when_price_stays_inside_the_range():
    swings = [_swing(0, 100, "low"), _swing(1, 110, "high"), _swing(2, 105, "low")]
    candles = [candle(0, 0, 0, 107, t=99)]
    assert structure.break_of_structure(candles, swings, "up") is None


def test_break_of_structure_none_without_a_clear_bias():
    swings = [_swing(0, 100, "low"), _swing(1, 110, "high")]
    candles = [candle(0, 0, 0, 200, t=99)]
    assert structure.break_of_structure(candles, swings, "range") is None


def test_regime_reversing_on_choch_regardless_of_prior_bias():
    assert structure.regime("up", {"kind": "CHoCH", "direction": -1, "level": 105}) == "REVERSING"


def test_regime_trending_on_bos():
    assert structure.regime("up", {"kind": "BOS", "direction": 1, "level": 110}) == "TRENDING"


def test_regime_ranging_without_a_clear_bias_or_break():
    assert structure.regime("range", None) == "RANGING"


def test_regime_trending_with_an_established_bias_and_no_fresh_break():
    assert structure.regime("up", None) == "TRENDING"


def test_equal_levels_clusters_nearby_swing_highs():
    swings = [_swing(0, 1000.0, "high"), _swing(1, 1000.5, "high"), _swing(2, 1200.0, "high")]
    pools = structure.equal_levels(swings, tolerance=0.001)
    assert len(pools) == 1
    assert pools[0]["kind"] == "high"
    assert pools[0]["touches"] == 2


def test_equal_levels_ignores_a_lone_swing():
    swings = [_swing(0, 1000.0, "high")]
    assert structure.equal_levels(swings, tolerance=0.001) == []


def test_swept_detects_a_wick_through_a_pool_that_closes_back_inside():
    pools = [{"kind": "high", "price": 1000.0, "touches": 2}]
    wick_through = candle(999.0, 1001.0, 998.0, 999.5)  # high pierces 1000, close stays under
    assert structure.swept(wick_through, pools) == pools[0]


def test_swept_is_none_on_a_clean_breakout_close():
    pools = [{"kind": "high", "price": 1000.0, "touches": 2}]
    clean_break = candle(999.0, 1005.0, 998.0, 1004.0)  # closes well above the pool
    assert structure.swept(clean_break, pools) is None


def test_nearest_levels_picks_the_closest_swing_each_side():
    swings = [_swing(0, 95, "low"), _swing(1, 98, "low"), _swing(2, 105, "high"), _swing(3, 110, "high")]
    levels = structure.nearest_levels(swings, price=100)
    assert levels == {"support": 98, "resistance": 105}


def test_nearest_levels_none_when_nothing_is_on_that_side():
    assert structure.nearest_levels([_swing(0, 105, "high")], price=100) == {"support": None, "resistance": 105}


def test_near_level_true_within_half_an_atr():
    assert structure.near_level(price=100.0, level=100.4, atr=1.0, within=0.5) is True


def test_near_level_false_beyond_the_window():
    assert structure.near_level(price=100.0, level=102.0, atr=1.0, within=0.5) is False


def test_near_level_false_without_a_level_or_atr():
    assert structure.near_level(100.0, None, 1.0) is False
    assert structure.near_level(100.0, 100.1, None) is False
