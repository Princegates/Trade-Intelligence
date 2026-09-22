from unittest.mock import patch

from src.signals import engine

# Real price series make every category's real output unpredictable, so the
# scoring/combination/gating logic in evaluate() is tested with the four
# category functions mocked directly — each is covered on its own merits in
# test_indicators.py, test_structure.py, test_divergence.py and
# test_patterns.py. What's under test here is only: do the votes combine
# correctly, and do the false-signal gates override a call back to HOLD.


def _candles(n=60):
    """Plain rising candles with ordinary bodies — long enough for every
    category, and shaped so no pattern fires by accident. A pure ramp has no
    swings (structure needs an actual up-down-up to find one), which is
    exactly why the confluence tests mock structure directly instead."""
    out = []
    for i in range(n):
        close = 100.0 + i
        out.append(
            {
                "open_time": i * 3600,
                "open": close - 0.4,
                "high": close + 0.2,
                "low": close - 0.6,
                "close": close,
                "volume": 1.0,
            }
        )
    return out


NEUTRAL_STRUCTURE = {"vote": 0, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None}
NEUTRAL_MOMENTUM = {"vote": 0, "reasons": [], "divergence": None}
NEUTRAL_PATTERN = {"vote": None, "reasons": [], "names": []}
OK_VOLATILITY = {"ok": True, "reasons": []}


def _patch_categories(trend=(0, "flat", []), momentum=NEUTRAL_MOMENTUM, structure=NEUTRAL_STRUCTURE, pattern=NEUTRAL_PATTERN, volatility=OK_VOLATILITY):
    return (
        patch("src.signals.engine._ema_trend", return_value=trend),
        patch("src.signals.engine._momentum", return_value=momentum),
        patch("src.signals.engine._structure", return_value=structure),
        patch("src.signals.engine._pattern", return_value=pattern),
        patch("src.signals.engine._volatility", return_value=volatility),
    )


def _evaluate_with(**overrides):
    patches = _patch_categories(**overrides)
    with patches[0], patches[1], patches[2], patches[3], patches[4]:
        return engine.evaluate(_candles())


def test_two_agreeing_categories_produce_buy():
    result = _evaluate_with(
        trend=(1, "up", []),
        structure={"vote": 1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None},
    )
    assert result["verdict"] == "BUY"
    assert result["score"] == 2


def test_two_agreeing_categories_produce_sell():
    result = _evaluate_with(
        trend=(-1, "down", []),
        structure={"vote": -1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None},
    )
    assert result["verdict"] == "SELL"
    assert result["score"] == -2


def test_a_single_bullish_category_is_not_enough_confluence():
    result = _evaluate_with(trend=(1, "up", []))
    assert result["verdict"] == "HOLD"
    assert result["score"] == 1


def test_categories_that_disagree_produce_hold():
    result = _evaluate_with(
        trend=(1, "up", []),
        structure={"vote": -1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None},
    )
    assert result["verdict"] == "HOLD"
    assert result["score"] == 0


def test_insufficient_evidence_forces_hold_even_with_a_clean_score():
    # Only trend has data; the other three categories are all unavailable.
    result = _evaluate_with(
        trend=(1, "up", []),
        momentum={"vote": None, "reasons": [], "divergence": None},
        structure={"vote": None, "reasons": [], "regime": "RANGING", "swings": [], "swept": None},
        pattern={"vote": None, "reasons": [], "names": []},
    )
    assert result["verdict"] == "HOLD"
    assert result["evidence_count"] == 1
    assert "too little evidence" in result["reasoning"][-1]


def test_a_confirmed_pattern_counts_as_the_second_vote():
    result = _evaluate_with(
        trend=(1, "up", []),
        pattern={"vote": 1, "reasons": ["Bullish Engulfing — n"], "names": ["Bullish Engulfing"]},
    )
    assert result["verdict"] == "BUY"
    assert result["patterns"] == ["Bullish Engulfing"]


def test_ranging_structure_overrides_a_would_be_buy_to_hold():
    result = _evaluate_with(
        trend=(1, "up", []),
        momentum={"vote": 1, "reasons": [], "divergence": None},
        structure={"vote": 0, "reasons": [], "regime": "RANGING", "swings": [], "swept": None},
    )
    assert result["verdict"] == "HOLD"
    assert any("ranging" in r for r in result["reasoning"])


def test_abnormal_volatility_overrides_a_would_be_sell_to_hold():
    result = _evaluate_with(
        trend=(-1, "down", []),
        structure={"vote": -1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None},
        volatility={"ok": False, "reasons": ["range spike"]},
    )
    assert result["verdict"] == "HOLD"
    assert any("volatility is abnormal" in r for r in result["reasoning"])


def test_a_liquidity_sweep_overrides_a_matching_breakout_to_hold():
    swept = {"kind": "high", "price": 150.0, "touches": 2}
    result = _evaluate_with(
        trend=(1, "up", []),
        structure={"vote": 1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": swept},
    )
    assert result["verdict"] == "HOLD"
    assert any("liquidity pool" in r for r in result["reasoning"])


def test_a_sweep_on_the_other_side_does_not_veto_this_call():
    # A swept high shouldn't block a SELL — only a swept high vetoes a BUY,
    # and a swept low vetoes a SELL (the direction the false breakout faked).
    swept = {"kind": "high", "price": 150.0, "touches": 2}
    result = _evaluate_with(
        trend=(-1, "down", []),
        structure={"vote": -1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": swept},
    )
    assert result["verdict"] == "SELL"


def test_bearish_divergence_overrides_a_would_be_buy_to_hold():
    result = _evaluate_with(
        trend=(1, "up", []),
        momentum={"vote": 1, "reasons": [], "divergence": {"kind": "bearish", "at": 0}},
        structure={"vote": 1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None},
    )
    assert result["verdict"] == "HOLD"
    assert any("divergence contradicts" in r for r in result["reasoning"])


def test_bullish_divergence_does_not_veto_a_buy():
    result = _evaluate_with(
        trend=(1, "up", []),
        momentum={"vote": 1, "reasons": [], "divergence": {"kind": "bullish", "at": 0}},
        structure={"vote": 1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None},
    )
    assert result["verdict"] == "BUY"


def test_confidence_is_absent_until_it_can_be_calibrated():
    assert _evaluate_with()["confidence"] is None


def test_evaluate_runs_end_to_end_on_real_data():
    result = engine.evaluate(_candles(80))
    assert result["verdict"] in {"BUY", "SELL", "HOLD"}
    assert result["reasoning"]


def test_a_directional_call_carries_entry_stop_and_target():
    result = engine.evaluate(_candles(80))
    levels = result["levels"]
    assert levels is not None

    if result["verdict"] == "BUY":
        assert levels["stop"] < levels["entry"] < levels["target"]
    elif result["verdict"] == "SELL":
        assert levels["target"] < levels["entry"] < levels["stop"]
    else:
        # HOLD frames the band to wait out instead of a trade.
        assert levels["entry"] is None
        assert levels["sell_below"] < levels["buy_above"]


def test_hold_reports_the_prices_that_would_change_its_mind():
    result = _evaluate_with()
    price = 100.0 + 59  # last close in the default 60-candle fixture

    assert result["verdict"] == "HOLD"
    assert result["levels"]["buy_above"] > price
    assert result["levels"]["sell_below"] < price


def _hammer_candle():
    # open=100.0, close=100.5: a real body, clear of the doji threshold.
    # low=97.0 gives a long lower wick, high=100.7 keeps the upper wick
    # small — the shape test_patterns.py already covers; what's new here is
    # whether _pattern() reads its *close* (100.5) against real S/R levels.
    return {"open_time": 99, "open": 100.0, "high": 100.7, "low": 97.0, "close": 100.5, "volume": 1.0}


def test_pattern_helper_counts_a_hammer_found_at_a_real_support_level():
    # The one seam not covered by test_patterns.py or test_structure.py in
    # isolation: engine._pattern() wiring pat.detect()'s output through
    # structure.nearest_levels()/near_level() for real, not mocked.
    swings = [{"index": 0, "open_time": 0, "price": 100.0, "kind": "low"}]
    candles = _candles(10) + [_hammer_candle()]
    result = engine._pattern(candles, "down", swings, atr_val=2.0)
    assert "Hammer" in result["names"]
    assert result["vote"] == 1  # close (100.5) within 0.5 ATR (1.0) of the support at 100.0


def test_pattern_helper_does_not_count_a_hammer_far_from_any_level():
    swings = [{"index": 0, "open_time": 0, "price": 10.0, "kind": "low"}]  # nowhere near price
    candles = _candles(10) + [_hammer_candle()]
    result = engine._pattern(candles, "down", swings, atr_val=2.0)
    assert "Hammer" in result["names"]
    assert result["vote"] == 0
    assert any("not at a meaningful" in r for r in result["reasons"])
