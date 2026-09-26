from src.signals import entry_zone


def test_structural_stop_buffers_below_support():
    levels = {"support": 100.0, "resistance": 120.0}
    assert entry_zone.structural_stop("support", 110.0, levels, atr_val=2.0, buffer_atr=0.25) == 100.0 - 0.5


def test_structural_stop_buffers_above_resistance():
    levels = {"support": 100.0, "resistance": 120.0}
    assert entry_zone.structural_stop("resistance", 110.0, levels, atr_val=2.0, buffer_atr=0.25) == 120.0 + 0.5


def test_structural_stop_is_none_without_a_level_on_that_side():
    levels = {"support": None, "resistance": 120.0}
    assert entry_zone.structural_stop("support", 110.0, levels, atr_val=2.0, buffer_atr=0.25) is None


def test_structural_stop_is_none_without_atr():
    levels = {"support": 100.0, "resistance": 120.0}
    assert entry_zone.structural_stop("support", 110.0, levels, atr_val=None, buffer_atr=0.25) is None
    assert entry_zone.structural_stop("support", 110.0, levels, atr_val=0, buffer_atr=0.25) is None


def test_structural_target_is_the_opposite_side():
    levels = {"support": 100.0, "resistance": 120.0}
    assert entry_zone.structural_target("support", levels) == 120.0
    assert entry_zone.structural_target("resistance", levels) == 100.0


def test_structural_target_is_none_without_a_level_on_the_opposite_side():
    levels = {"support": 100.0, "resistance": None}
    assert entry_zone.structural_target("support", levels) is None


def test_invalidation_level_is_the_raw_same_side_level():
    levels = {"support": 100.0, "resistance": 120.0}
    assert entry_zone.invalidation_level("support", levels) == 100.0
    assert entry_zone.invalidation_level("resistance", levels) == 120.0


def test_invalidation_level_is_none_without_a_level():
    levels = {"support": None, "resistance": 120.0}
    assert entry_zone.invalidation_level("support", levels) is None


def test_entry_zone_is_none_without_atr_or_a_level():
    levels = {"support": 100.0, "resistance": 120.0}
    assert entry_zone.entry_zone("support", 110.0, levels, atr_val=None, zone_width_atr=0.5) is None
    assert entry_zone.entry_zone("support", 110.0, {"support": None, "resistance": 120.0}, atr_val=2.0, zone_width_atr=0.5) is None


def test_entry_zone_marks_price_inside_the_band():
    levels = {"support": 100.0, "resistance": 120.0}
    result = entry_zone.entry_zone("support", 100.5, levels, atr_val=2.0, zone_width_atr=0.5)
    assert result["preferred_entry"] == 100.0
    assert result["zone_low"] == 99.0
    assert result["zone_high"] == 101.0
    assert result["inside_zone"] is True
    assert result["distance_atr"] == 0.0


def test_entry_zone_reports_distance_when_outside_the_band():
    levels = {"support": 100.0, "resistance": 120.0}
    # zone is [99, 101]; price sits 4 above zone_high (101), atr=2 -> 2.0 ATRs
    result = entry_zone.entry_zone("support", 105.0, levels, atr_val=2.0, zone_width_atr=0.5)
    assert result["inside_zone"] is False
    assert result["distance_atr"] == 2.0


def test_distance_exceeds_is_false_with_no_zone():
    assert entry_zone.distance_exceeds(None, 1.5) is False


def test_distance_exceeds_is_false_inside_the_zone():
    zone = {"inside_zone": True, "distance_atr": 0.0}
    assert entry_zone.distance_exceeds(zone, 1.5) is False


def test_distance_exceeds_compares_distance_to_the_max():
    under = {"inside_zone": False, "distance_atr": 1.0}
    over = {"inside_zone": False, "distance_atr": 2.0}
    assert entry_zone.distance_exceeds(under, 1.5) is False
    assert entry_zone.distance_exceeds(over, 1.5) is True


def test_market_phase_reversing_wins_outright():
    assert entry_zone.market_phase("REVERSING", {"kind": "BOS", "direction": 1, "level": 1}, None) == "REVERSAL"


def test_market_phase_ranging_wins_outright():
    assert entry_zone.market_phase("RANGING", {"kind": "BOS", "direction": 1, "level": 1}, None) == "CONSOLIDATION"


def test_market_phase_fresh_bos_is_breakout():
    assert entry_zone.market_phase("TRENDING", {"kind": "BOS", "direction": 1, "level": 1}, None) == "BREAKOUT"


def test_market_phase_choch_is_not_a_breakout():
    # A CHoCH isn't a BOS, so with no break_event["kind"] == "BOS" match it
    # falls through to the zone/impulse check below, same as no break at all.
    zone = {"inside_zone": True}
    event = {"kind": "CHoCH", "direction": -1, "level": 1}
    assert entry_zone.market_phase("TRENDING", event, zone) == "PULLBACK"


def test_market_phase_inside_zone_with_no_break_is_pullback():
    zone = {"inside_zone": True}
    assert entry_zone.market_phase("TRENDING", None, zone) == "PULLBACK"


def test_market_phase_defaults_to_impulse():
    assert entry_zone.market_phase("TRENDING", None, None) == "IMPULSE"
    outside_zone = {"inside_zone": False}
    assert entry_zone.market_phase("TRENDING", None, outside_zone) == "IMPULSE"
