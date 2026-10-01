"""Direct tests of src/signals/risk_engine.py — the centralized module
src/signals/entry_zone.py and src/signals/structural_stop.py now delegate
to. tests/test_entry_zone.py and tests/test_structural_stop.py already
regression-prove the delegation is byte-identical to before this module
existed; these tests prove the centralized math itself is correct."""

from src.signals import risk_engine


def _candle(low, high):
    return {"open": (low + high) / 2, "high": high, "low": low, "close": (low + high) / 2, "volume": 1.0}


def _swing(price, kind="high"):
    return {"index": 0, "open_time": 0, "price": price, "kind": kind}


# --- stop_from_nearest_level / target_from_nearest_level (confluence anchor) --


def test_stop_from_nearest_level_buffers_below_support():
    levels = {"support": 100.0, "resistance": 120.0}
    assert risk_engine.stop_from_nearest_level("support", 110.0, levels, atr_val=2.0, buffer_atr=0.25) == 99.5


def test_stop_from_nearest_level_buffers_above_resistance():
    levels = {"support": 100.0, "resistance": 120.0}
    assert risk_engine.stop_from_nearest_level("resistance", 110.0, levels, atr_val=2.0, buffer_atr=0.25) == 120.5


def test_stop_from_nearest_level_none_without_a_level_or_atr():
    levels = {"support": None, "resistance": 120.0}
    assert risk_engine.stop_from_nearest_level("support", 110.0, levels, atr_val=2.0, buffer_atr=0.25) is None
    levels = {"support": 100.0, "resistance": 120.0}
    assert risk_engine.stop_from_nearest_level("support", 110.0, levels, atr_val=None, buffer_atr=0.25) is None


def test_target_from_nearest_level_is_the_opposite_side():
    levels = {"support": 100.0, "resistance": 120.0}
    assert risk_engine.target_from_nearest_level("support", levels) == 120.0
    assert risk_engine.target_from_nearest_level("resistance", levels) == 100.0


# --- stop_from_formation (GUDA SPECIAL anchor) --------------------------------


def test_stop_from_formation_below_the_lowest_low_for_a_buy():
    formation = [_candle(98.0, 101.0), _candle(97.0, 100.0), _candle(99.0, 103.0)]
    stop = risk_engine.stop_from_formation(formation, direction=1, buffer_atr=0.25, atr_val=2.0)
    assert stop == 96.5


def test_stop_from_formation_above_the_highest_high_for_a_sell():
    formation = [_candle(98.0, 101.0), _candle(99.0, 104.0), _candle(97.0, 100.0)]
    stop = risk_engine.stop_from_formation(formation, direction=-1, buffer_atr=0.25, atr_val=2.0)
    assert stop == 104.5


def test_stop_from_formation_widened_by_an_anchor_level():
    formation = [_candle(98.0, 101.0), _candle(97.5, 100.0)]
    stop = risk_engine.stop_from_formation(formation, direction=1, buffer_atr=0.25, atr_val=2.0, anchor_level=96.0)
    assert stop == 95.5


def test_stop_from_formation_none_without_atr():
    formation = [_candle(98.0, 101.0)]
    assert risk_engine.stop_from_formation(formation, direction=1, buffer_atr=0.25, atr_val=None) is None


# --- target_from_risk_reward (the one formula centralized out of 3 places) ----


def test_target_from_risk_reward_for_a_buy():
    assert risk_engine.target_from_risk_reward(entry=100.0, stop=98.0, rr_multiple=2.0, direction=1) == 104.0


def test_target_from_risk_reward_for_a_sell():
    assert risk_engine.target_from_risk_reward(entry=100.0, stop=102.0, rr_multiple=2.0, direction=-1) == 96.0


# --- sanity_check --------------------------------------------------------------


def test_sanity_check_rejects_a_noise_sized_stop():
    ok, reason = risk_engine.sanity_check(entry=100.0, stop=99.9, atr_val=2.0, max_risk_distance_atr=3.0, min_stop_distance_atr=0.3)
    assert ok is False
    assert "noise" in reason


def test_sanity_check_rejects_an_excessive_stop():
    ok, reason = risk_engine.sanity_check(entry=100.0, stop=93.0, atr_val=2.0, max_risk_distance_atr=3.0, min_stop_distance_atr=0.3)
    assert ok is False
    assert "too far" in reason


def test_sanity_check_passes_a_reasonable_stop():
    ok, reason = risk_engine.sanity_check(entry=100.0, stop=98.0, atr_val=2.0, max_risk_distance_atr=3.0, min_stop_distance_atr=0.3)
    assert ok is True
    assert reason is None


# --- target_conflict -------------------------------------------------------------


def test_target_conflict_true_when_a_swing_sits_between_entry_and_target():
    swings = [_swing(102.0)]
    assert risk_engine.target_conflict(swings, entry=100.0, target=105.0, direction=1) is True


def test_target_conflict_false_when_nothing_is_in_the_way():
    swings = [_swing(110.0)]
    assert risk_engine.target_conflict(swings, entry=100.0, target=105.0, direction=1) is False
