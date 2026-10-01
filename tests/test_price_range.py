from src.signals import price_range


def test_analyze_none_for_degenerate_range():
    assert price_range.analyze(high=None, low=100.0, price=105.0) is None
    assert price_range.analyze(high=120.0, low=None, price=105.0) is None
    assert price_range.analyze(high=100.0, low=100.0, price=100.0) is None
    assert price_range.analyze(high=90.0, low=100.0, price=95.0) is None


def test_analyze_basic_fields():
    result = price_range.analyze(high=120.0, low=100.0, price=110.0)
    assert result["high"] == 120.0
    assert result["low"] == 100.0
    assert result["range"] == 20.0
    assert result["midpoint"] == 110.0
    assert result["position_pct"] == 50.0
    assert result["zone"] == "EQUILIBRIUM"


def test_zone_deep_discount_at_the_low():
    assert price_range.zone(0.0) == "DEEP_DISCOUNT"
    assert price_range.zone(10.0) == "DEEP_DISCOUNT"


def test_zone_deep_premium_at_the_high():
    assert price_range.zone(100.0) == "DEEP_PREMIUM"
    assert price_range.zone(90.0) == "DEEP_PREMIUM"


def test_zone_discount_below_equilibrium():
    assert price_range.zone(30.0) == "DISCOUNT"


def test_zone_premium_above_equilibrium():
    assert price_range.zone(70.0) == "PREMIUM"


def test_zone_equilibrium_near_the_midpoint():
    assert price_range.zone(50.0) == "EQUILIBRIUM"
    assert price_range.zone(45.0) == "EQUILIBRIUM"
    assert price_range.zone(55.0) == "EQUILIBRIUM"


def test_zone_never_clamps_position_pct_out_of_range():
    # Price trading outside the measured range (a stale reference range)
    # reads as more deeply discounted/premium than the band itself, not
    # clamped to the 0-100 edge — the point is to still show it broke out.
    assert price_range.zone(-15.0) == "DEEP_DISCOUNT"
    assert price_range.zone(115.0) == "DEEP_PREMIUM"


def test_analyze_position_pct_outside_range_is_not_clamped():
    result = price_range.analyze(high=120.0, low=100.0, price=130.0)
    assert result["position_pct"] == 150.0
    assert result["zone"] == "DEEP_PREMIUM"
