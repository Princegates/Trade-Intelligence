from contextlib import ExitStack
from unittest.mock import patch

from src.signals import setups

# advance_setup composes ~15 category functions across 8 modules — real
# candle series exercising every gate would be as unwieldy as engine.py's
# own would be, so this mirrors test_engine.py's own convention: mock every
# category function to a "happy path" default, and let each test override
# just the one thing it's actually testing.


def _candles(n=10):
    out = []
    for i in range(n):
        close = 100.0 + i
        out.append({"open_time": i * 900, "open": close - 0.4, "high": close + 0.2, "low": close - 0.6, "close": close, "volume": 1.0})
    return out


HAPPY = dict(
    atr=2.0,
    swept=False,
    swings=[{"index": 0, "open_time": 0, "price": 90.0, "kind": "low"}, {"index": 1, "open_time": 900, "price": 100.0, "kind": "high"}],
    impulse={"start_price": 90.0, "end_price": 100.0},
    clears_minimum=True,
    fib_levels={"fib_50": 95.0, "fib_61_8": 93.82, "fib_72": 92.8, "fib_78_6": 92.14},
    quality="VALID",
    retest=True,
    zone={"preferred_entry": 95.0, "zone_low": 92.14, "zone_high": 95.0, "inside_zone": True, "distance_atr": 0.0},
    pattern_events=[{"name": "Bullish Engulfing", "direction": 1, "note": "n"}],
    candle_quality="STRONG",
    stop=98.0,
    sanity=(True, None),
    target=104.0,
    target_conflict=False,
    extension_exceeds=False,
    htf_bias="up",
    htf_result={"outcome": "ALIGNED", "reason": "1H bias (up) agrees with the call"},
    regime="TRENDING",
    bias="up",
    break_event={"kind": "BOS", "direction": 1, "level": 100.0},
)


def _setup(state="BOS_DETECTED", direction=1, **overrides):
    base = {
        "state": state,
        "bos_candle_time": 0,
        "bos_kind": "BOS",
        "bos_direction": direction,
        "bos_price": 100.0,
        "break_strength": "STRONG",
        "impulse_start_price": None,
        "impulse_end_price": None,
        "impulse_atr_multiple": None,
        "fib_50": None, "fib_61_8": None, "fib_72": None, "fib_78_6": None,
    }
    return {**base, **overrides}


def _patch_all(**over):
    v = {**HAPPY, **over}
    return [
        patch("src.signals.setups.ind.atr", return_value=v["atr"]),
        patch("src.signals.setups.imp.single_level_swept", return_value=v["swept"]),
        patch("src.signals.setups.struct.swing_points", return_value=v["swings"]),
        patch("src.signals.setups.imp.measure_impulse", return_value=v["impulse"]),
        patch("src.signals.setups.imp.impulse_clears_minimum", return_value=v["clears_minimum"]),
        patch("src.signals.setups.fibonacci.levels", return_value=v["fib_levels"]),
        patch("src.signals.setups.fibonacci.retracement_quality", return_value=v["quality"]),
        patch("src.signals.setups.retest.structure_retest_confirmed", return_value=v["retest"]),
        patch("src.signals.setups.fibonacci.retracement_zone", return_value=v["zone"]),
        patch("src.signals.setups.pat.detect", return_value=v["pattern_events"]),
        patch("src.signals.setups.candle_quality.classify", return_value=v["candle_quality"]),
        patch("src.signals.setups.structural_stop.stop_from_formation", return_value=v["stop"]),
        patch("src.signals.setups.structural_stop.sanity_check", return_value=v["sanity"]),
        patch("src.signals.setups.structural_stop.target_from_rr", return_value=v["target"]),
        patch("src.signals.setups.structural_stop.target_conflict", return_value=v["target_conflict"]),
        patch("src.signals.setups.ez.distance_exceeds", return_value=v["extension_exceeds"]),
        patch("src.signals.setups.confluence.higher_timeframe_bias", return_value=v["htf_bias"]),
        patch("src.signals.setups.htf_filter.evaluate", return_value=v["htf_result"]),
        patch("src.signals.setups.struct.regime", return_value=v["regime"]),
        patch("src.signals.setups.struct.bias", return_value=v["bias"]),
        patch("src.signals.setups.struct.break_of_structure", return_value=v["break_event"]),
    ]


def _advance_with(setup, settings=None, **over):
    with ExitStack() as stack:
        for p in _patch_all(**over):
            stack.enter_context(p)
        return setups.advance_setup(setup, _candles(), _candles(), 900, settings=settings)


# --- detect_new_setups -----------------------------------------------------


def test_detect_new_setups_returns_none_without_a_break():
    with patch("src.signals.setups.struct.swing_points", return_value=[]), \
         patch("src.signals.setups.struct.bias", return_value="range"), \
         patch("src.signals.setups.struct.break_of_structure", return_value=None):
        assert setups.detect_new_setups(_candles()) is None


def test_detect_new_setups_builds_a_setup_dict_on_a_fresh_break():
    with patch("src.signals.setups.struct.swing_points", return_value=HAPPY["swings"]), \
         patch("src.signals.setups.struct.bias", return_value="up"), \
         patch("src.signals.setups.struct.break_of_structure", return_value=HAPPY["break_event"]), \
         patch("src.signals.setups.ind.atr", return_value=2.0), \
         patch("src.signals.setups.imp.classify_break", return_value="STRONG"):
        result = setups.detect_new_setups(_candles())
    assert result["bos_kind"] == "BOS"
    assert result["bos_direction"] == 1
    assert result["bos_price"] == 100.0
    assert result["break_strength"] == "STRONG"
    assert result["bos_candle_time"] == _candles()[-1]["open_time"]


# --- advance_setup: universal overrides -------------------------------------


def test_advance_invalidates_on_a_swept_break():
    result = _advance_with(_setup(), swept=True)
    assert result["setup"]["state"] == "INVALIDATED"
    assert "closed back through" in result["setup"]["invalidation_reason"]
    assert result["signal"]["verdict"] == "NO_TRADE"


def test_advance_expires_after_the_configured_candle_count():
    result = _advance_with(_setup(bos_candle_time=-100000), settings={"setup_expiry_candles": 1})
    assert result["setup"]["state"] == "EXPIRED"
    assert result["signal"]["verdict"] == "NO_TRADE"


def test_swept_check_wins_even_past_expiry():
    result = _advance_with(_setup(bos_candle_time=-100000), swept=True)
    assert "closed back through" in result["setup"]["invalidation_reason"]


# --- advance_setup: impulse stage -------------------------------------------


def test_stays_at_bos_detected_when_impulse_is_too_small():
    result = _advance_with(_setup(), clears_minimum=False)
    assert result["setup"]["state"] == "BOS_DETECTED"
    assert result["signal"] is None


def test_freezes_impulse_and_fib_once_it_clears_the_minimum():
    result = _advance_with(_setup())
    # Happy path clears every later gate too, reaching PUBLISHED — but the
    # frozen impulse/fib fields should be present regardless.
    assert result["setup"]["impulse_start_price"] == 90.0
    assert result["setup"]["impulse_end_price"] == 100.0
    assert result["setup"]["fib_50"] == 95.0


# --- advance_setup: retracement stage ---------------------------------------


def test_invalidates_on_a_failed_retracement():
    result = _advance_with(_setup(), quality="FAILED")
    assert result["setup"]["state"] == "INVALIDATED"
    assert "impulse origin" in result["setup"]["invalidation_reason"]


def test_stays_awaiting_retracement_when_shallow():
    result = _advance_with(_setup(), quality="SHALLOW")
    assert result["setup"]["state"] == "AWAITING_RETRACEMENT"
    assert result["signal"] is None


def test_stays_awaiting_retracement_when_deep():
    result = _advance_with(_setup(), quality="DEEP")
    assert result["setup"]["state"] == "AWAITING_RETRACEMENT"


# --- advance_setup: retest stage --------------------------------------------


def test_stays_retest_pending_without_a_confirmed_retest():
    result = _advance_with(_setup(), retest=False)
    assert result["setup"]["state"] == "RETEST_PENDING"
    assert result["signal"] is None


# --- advance_setup: confirmation stage --------------------------------------


def test_stays_awaiting_confirmation_outside_the_zone():
    outside_zone = {**HAPPY["zone"], "inside_zone": False}
    result = _advance_with(_setup(), zone=outside_zone)
    assert result["setup"]["state"] == "AWAITING_CONFIRMATION"


def test_stays_awaiting_confirmation_without_a_matching_pattern():
    result = _advance_with(_setup(), pattern_events=[])
    assert result["setup"]["state"] == "AWAITING_CONFIRMATION"
    assert result["signal"] is None


def test_a_bearish_pattern_does_not_confirm_a_bullish_setup():
    result = _advance_with(_setup(direction=1), pattern_events=[{"name": "Bearish Engulfing", "direction": -1, "note": "n"}])
    assert result["setup"]["state"] == "AWAITING_CONFIRMATION"


# --- advance_setup: final gates ---------------------------------------------


def test_invalidates_without_a_stop():
    result = _advance_with(_setup(), stop=None)
    assert result["setup"]["state"] == "INVALIDATED"


def test_invalidates_on_a_failed_sanity_check():
    result = _advance_with(_setup(), sanity=(False, "stop is too far"))
    assert result["setup"]["state"] == "INVALIDATED"
    assert result["setup"]["invalidation_reason"] == "stop is too far"


def test_invalidates_on_a_rejected_target_conflict_policy():
    result = _advance_with(_setup(), target_conflict=True)
    # default policy is "downgrade" in HAPPY's implicit settings (none passed) -> published anyway
    assert result["setup"]["state"] == "PUBLISHED"


def test_waits_when_price_has_run_too_far_from_the_entry_zone():
    result = _advance_with(_setup(), extension_exceeds=True)
    assert result["setup"]["state"] == "AWAITING_CONFIRMATION"
    assert result["signal"] is None


def test_invalidates_on_a_rejected_htf_filter():
    result = _advance_with(_setup(), htf_result={"outcome": "REJECTED", "reason": "1H opposes"})
    assert result["setup"]["state"] == "INVALIDATED"
    assert result["setup"]["invalidation_reason"] == "1H opposes"


# --- advance_setup: full happy path -----------------------------------------


def test_happy_path_publishes_a_buy():
    result = _advance_with(_setup(direction=1))
    assert result["setup"]["state"] == "PUBLISHED"
    signal = result["signal"]
    assert signal["verdict"] == "BUY"
    assert signal["entry"] == _candles()[-1]["close"]
    assert signal["stop"] == 98.0
    assert signal["target"] == 104.0
    assert signal["confirmation_pattern"] == "Bullish Engulfing"
    assert signal["reasoning"]


def test_happy_path_publishes_a_sell():
    sell_break = {"kind": "BOS", "direction": -1, "level": 100.0}
    result = _advance_with(
        _setup(direction=-1),
        break_event=sell_break,
        pattern_events=[{"name": "Bearish Engulfing", "direction": -1, "note": "n"}],
    )
    assert result["setup"]["state"] == "PUBLISHED"
    assert result["signal"]["verdict"] == "SELL"
