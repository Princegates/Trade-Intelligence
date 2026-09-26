from src.signals import structural_stop


def _candle(low, high):
    return {"open": (low + high) / 2, "high": high, "low": low, "close": (low + high) / 2, "volume": 1.0}


# --- stop_from_formation ---------------------------------------------------


def test_stop_from_formation_below_the_lowest_low_for_a_buy():
    formation = [_candle(98.0, 101.0), _candle(97.0, 100.0), _candle(99.0, 103.0)]
    stop = structural_stop.stop_from_formation(formation, direction=1, buffer_atr=0.25, atr_val=2.0)
    assert stop == 97.0 - 0.5


def test_stop_from_formation_above_the_highest_high_for_a_sell():
    formation = [_candle(98.0, 101.0), _candle(99.0, 104.0), _candle(97.0, 100.0)]
    stop = structural_stop.stop_from_formation(formation, direction=-1, buffer_atr=0.25, atr_val=2.0)
    assert stop == 104.0 + 0.5


def test_stop_from_formation_is_none_without_atr():
    formation = [_candle(98.0, 101.0)]
    assert structural_stop.stop_from_formation(formation, direction=1, buffer_atr=0.25, atr_val=None) is None
    assert structural_stop.stop_from_formation(formation, direction=1, buffer_atr=0.25, atr_val=0) is None


# --- sanity_check ------------------------------------------------------------


def test_sanity_check_rejects_a_noise_sized_stop():
    ok, reason = structural_stop.sanity_check(
        entry=100.0, stop=99.9, atr_val=2.0, max_risk_distance_atr=3.0, min_stop_distance_atr=0.3
    )
    assert ok is False
    assert "noise" in reason


def test_sanity_check_rejects_an_excessive_stop():
    ok, reason = structural_stop.sanity_check(
        entry=100.0, stop=93.0, atr_val=2.0, max_risk_distance_atr=3.0, min_stop_distance_atr=0.3
    )
    assert ok is False
    assert "too far" in reason


def test_sanity_check_passes_a_reasonable_stop():
    ok, reason = structural_stop.sanity_check(
        entry=100.0, stop=98.0, atr_val=2.0, max_risk_distance_atr=3.0, min_stop_distance_atr=0.3
    )
    assert ok is True
    assert reason is None


def test_sanity_check_rejects_without_atr():
    ok, reason = structural_stop.sanity_check(
        entry=100.0, stop=98.0, atr_val=None, max_risk_distance_atr=3.0, min_stop_distance_atr=0.3
    )
    assert ok is False


# --- target_from_rr ----------------------------------------------------------


def test_target_from_rr_for_a_buy():
    assert structural_stop.target_from_rr(entry=100.0, stop=98.0, rr_multiple=2.0, direction=1) == 104.0


def test_target_from_rr_for_a_sell():
    assert structural_stop.target_from_rr(entry=100.0, stop=102.0, rr_multiple=2.0, direction=-1) == 96.0


# --- target_conflict -----------------------------------------------------------


def _swing(price, kind="high"):
    return {"index": 0, "open_time": 0, "price": price, "kind": kind}


def test_target_conflict_true_when_a_swing_sits_between_entry_and_target():
    swings = [_swing(102.0)]
    assert structural_stop.target_conflict(swings, entry=100.0, target=105.0, direction=1) is True


def test_target_conflict_false_when_nothing_is_in_the_way():
    swings = [_swing(110.0)]
    assert structural_stop.target_conflict(swings, entry=100.0, target=105.0, direction=1) is False


def test_target_conflict_works_regardless_of_direction():
    swings = [_swing(97.0, "low")]
    assert structural_stop.target_conflict(swings, entry=100.0, target=95.0, direction=-1) is True
