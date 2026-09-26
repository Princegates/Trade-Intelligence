from src.signals import fibonacci


# --- levels ------------------------------------------------------------


def test_levels_for_a_bullish_impulse_retrace_down_from_the_high():
    result = fibonacci.levels(impulse_start=90.0, impulse_end=100.0, direction=1)
    assert result["fib_50"] == 95.0
    assert round(result["fib_61_8"], 2) == 93.82
    assert result["fib_72"] == 92.8
    assert round(result["fib_78_6"], 2) == 92.14
    # Deeper retracement fractions are lower prices for a bullish impulse.
    assert result["fib_78_6"] < result["fib_72"] < result["fib_61_8"] < result["fib_50"]


def test_levels_for_a_bearish_impulse_retrace_up_from_the_low():
    result = fibonacci.levels(impulse_start=110.0, impulse_end=100.0, direction=-1)
    assert result["fib_50"] == 105.0
    assert round(result["fib_61_8"], 2) == 106.18
    assert result["fib_72"] == 107.2
    assert round(result["fib_78_6"], 2) == 107.86
    # Deeper retracement fractions are higher prices for a bearish impulse.
    assert result["fib_50"] < result["fib_61_8"] < result["fib_72"] < result["fib_78_6"]


# --- retracement_zone ----------------------------------------------------


def test_retracement_zone_spans_50_to_78_6_bullish():
    fib = fibonacci.levels(90.0, 100.0, direction=1)
    zone = fibonacci.retracement_zone(fib, price=93.0, atr_val=2.0)
    assert round(zone["zone_low"], 2) == 92.14
    assert zone["zone_high"] == 95.0
    assert zone["inside_zone"] is True
    assert zone["distance_atr"] == 0.0


def test_retracement_zone_reports_distance_when_outside():
    fib = fibonacci.levels(90.0, 100.0, direction=1)
    zone = fibonacci.retracement_zone(fib, price=99.0, atr_val=2.0)
    assert zone["inside_zone"] is False
    assert zone["distance_atr"] > 0.0


def test_retracement_zone_is_none_without_atr():
    fib = fibonacci.levels(90.0, 100.0, direction=1)
    assert fibonacci.retracement_zone(fib, price=93.0, atr_val=None) is None
    assert fibonacci.retracement_zone(fib, price=93.0, atr_val=0) is None


# --- retracement_quality ---------------------------------------------------


def test_retracement_quality_shallow_when_barely_retraced():
    assert fibonacci.retracement_quality(90.0, 100.0, price=99.0, direction=1) == "SHALLOW"


def test_retracement_quality_shallow_when_still_extending():
    assert fibonacci.retracement_quality(90.0, 100.0, price=101.0, direction=1) == "SHALLOW"


def test_retracement_quality_valid_inside_the_primary_zone():
    assert fibonacci.retracement_quality(90.0, 100.0, price=95.0, direction=1) == "VALID"
    assert fibonacci.retracement_quality(90.0, 100.0, price=92.5, direction=1) == "VALID"


def test_retracement_quality_deep_beyond_78_6_but_not_failed():
    # 85% retraced: between valid_max (0.786) and deep_max (0.886).
    price = 100.0 - 10.0 * 0.85
    assert fibonacci.retracement_quality(90.0, 100.0, price=price, direction=1) == "DEEP"


def test_retracement_quality_failed_beyond_the_impulse_origin():
    assert fibonacci.retracement_quality(90.0, 100.0, price=89.0, direction=1) == "FAILED"


def test_retracement_quality_mirrors_for_a_bearish_impulse():
    assert fibonacci.retracement_quality(110.0, 100.0, price=105.0, direction=-1) == "VALID"
    assert fibonacci.retracement_quality(110.0, 100.0, price=101.0, direction=-1) == "SHALLOW"
    assert fibonacci.retracement_quality(110.0, 100.0, price=111.0, direction=-1) == "FAILED"


def test_retracement_quality_failed_with_a_zero_size_impulse():
    assert fibonacci.retracement_quality(100.0, 100.0, price=100.0, direction=1) == "FAILED"
