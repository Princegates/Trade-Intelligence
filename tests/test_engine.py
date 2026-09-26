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


NEUTRAL_STRUCTURE = {"vote": 0, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None, "break_event": None, "trend_bias": None}
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


def _evaluate_with(higher_timeframe_bias=None, settings=None, **overrides):
    patches = _patch_categories(**overrides)
    with patches[0], patches[1], patches[2], patches[3], patches[4]:
        return engine.evaluate(_candles(), higher_timeframe_bias=higher_timeframe_bias, settings=settings)


def test_two_agreeing_categories_produce_buy():
    result = _evaluate_with(
        trend=(1, "up", []),
        structure={"vote": 1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None, "break_event": None, "trend_bias": None},
    )
    assert result["verdict"] == "BUY"
    assert result["score"] == 2


def test_two_agreeing_categories_produce_sell():
    result = _evaluate_with(
        trend=(-1, "down", []),
        structure={"vote": -1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None, "break_event": None, "trend_bias": None},
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
        structure={"vote": -1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None, "break_event": None, "trend_bias": None},
    )
    assert result["verdict"] == "HOLD"
    assert result["score"] == 0


def test_insufficient_evidence_forces_hold_even_with_a_clean_score():
    # Only trend has data; the other three categories are all unavailable.
    result = _evaluate_with(
        trend=(1, "up", []),
        momentum={"vote": None, "reasons": [], "divergence": None},
        structure={"vote": None, "reasons": [], "regime": "RANGING", "swings": [], "swept": None, "break_event": None, "trend_bias": None},
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
        structure={"vote": 0, "reasons": [], "regime": "RANGING", "swings": [], "swept": None, "break_event": None, "trend_bias": None},
    )
    assert result["verdict"] == "HOLD"
    assert any("ranging" in r for r in result["reasoning"])


def test_abnormal_volatility_overrides_a_would_be_sell_to_hold():
    result = _evaluate_with(
        trend=(-1, "down", []),
        structure={"vote": -1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None, "break_event": None, "trend_bias": None},
        volatility={"ok": False, "reasons": ["range spike"]},
    )
    assert result["verdict"] == "HOLD"
    assert any("volatility is abnormal" in r for r in result["reasoning"])


def test_a_liquidity_sweep_overrides_a_matching_breakout_to_hold():
    swept = {"kind": "high", "price": 150.0, "touches": 2}
    result = _evaluate_with(
        trend=(1, "up", []),
        structure={"vote": 1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": swept, "break_event": None, "trend_bias": None},
    )
    assert result["verdict"] == "HOLD"
    assert any("liquidity pool" in r for r in result["reasoning"])


def test_a_sweep_on_the_other_side_does_not_veto_this_call():
    # A swept high shouldn't block a SELL — only a swept high vetoes a BUY,
    # and a swept low vetoes a SELL (the direction the false breakout faked).
    swept = {"kind": "high", "price": 150.0, "touches": 2}
    result = _evaluate_with(
        trend=(-1, "down", []),
        structure={"vote": -1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": swept, "break_event": None, "trend_bias": None},
    )
    assert result["verdict"] == "SELL"


def test_bearish_divergence_overrides_a_would_be_buy_to_hold():
    result = _evaluate_with(
        trend=(1, "up", []),
        momentum={"vote": 1, "reasons": [], "divergence": {"kind": "bearish", "at": 0}},
        structure={"vote": 1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None, "break_event": None, "trend_bias": None},
    )
    assert result["verdict"] == "HOLD"
    assert any("divergence contradicts" in r for r in result["reasoning"])


def test_bullish_divergence_does_not_veto_a_buy():
    result = _evaluate_with(
        trend=(1, "up", []),
        momentum={"vote": 1, "reasons": [], "divergence": {"kind": "bullish", "at": 0}},
        structure={"vote": 1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None, "break_event": None, "trend_bias": None},
    )
    assert result["verdict"] == "BUY"


def test_confidence_is_absent_until_it_can_be_calibrated():
    assert _evaluate_with()["confidence"] is None


# --- New in 3.0.0: cross-timeframe confluence, R:R gate, confidence -------
#
# All three default to fully inert (higher_timeframe_bias=None, settings=
# None) so every test above this point — none of which passes either
# argument — keeps asserting exactly the same thing it did before these
# gates existed. That's the backward-compatibility contract; these tests
# cover the new, opt-in behavior specifically.

_AGREE = dict(
    trend=(1, "up", []),
    structure={"vote": 1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None, "break_event": None, "trend_bias": None},
)


def test_omitting_both_new_params_reproduces_todays_behavior():
    with_defaults = _evaluate_with(**_AGREE)
    explicit_none = _evaluate_with(higher_timeframe_bias=None, settings=None, **_AGREE)
    assert with_defaults["verdict"] == explicit_none["verdict"] == "BUY"
    assert with_defaults["score"] == explicit_none["score"]


def test_an_opposing_higher_timeframe_overrides_a_buy_to_hold():
    result = _evaluate_with(higher_timeframe_bias="down", **_AGREE)
    assert result["verdict"] == "HOLD"
    assert any("higher timeframe's structure is trending down" in r for r in result["reasoning"])


def test_an_opposing_higher_timeframe_overrides_a_sell_to_hold():
    result = _evaluate_with(
        higher_timeframe_bias="up",
        trend=(-1, "down", []),
        structure={"vote": -1, "reasons": [], "regime": "TRENDING", "swings": [], "swept": None, "break_event": None, "trend_bias": None},
    )
    assert result["verdict"] == "HOLD"


def test_an_agreeing_higher_timeframe_does_not_veto():
    result = _evaluate_with(higher_timeframe_bias="up", **_AGREE)
    assert result["verdict"] == "BUY"


def test_no_higher_timeframe_data_does_not_veto():
    result = _evaluate_with(higher_timeframe_bias=None, **_AGREE)
    assert result["verdict"] == "BUY"


def test_confluence_gate_can_be_turned_off():
    result = _evaluate_with(
        higher_timeframe_bias="down",
        settings={"require_higher_timeframe_confluence": False},
        **_AGREE,
    )
    assert result["verdict"] == "BUY"


def test_rr_gate_is_inert_without_a_configured_minimum():
    result = _evaluate_with(settings={}, **_AGREE)
    assert result["verdict"] == "BUY"


def test_rr_gate_overrides_to_hold_when_the_fixed_ratio_is_below_the_minimum():
    # Today's fixed REWARD_TO_RISK is 1.5 — asking for more than that can
    # never be met until stop/target stop being a fixed multiple of each
    # other (a later phase), so this is real, computed, and deterministic.
    result = _evaluate_with(settings={"min_reward_to_risk": 3.0}, **_AGREE)
    assert result["verdict"] == "HOLD"
    assert any("risk/reward does not clear" in r for r in result["reasoning"])


def test_rr_gate_passes_when_the_minimum_is_at_or_below_the_fixed_ratio():
    result = _evaluate_with(settings={"min_reward_to_risk": 1.5}, **_AGREE)
    assert result["verdict"] == "BUY"


def test_atr_stop_multiplier_and_reward_to_risk_are_overridable():
    default = _evaluate_with(**_AGREE)
    overridden = _evaluate_with(settings={"atr_stop_multiplier": 1.5, "reward_to_risk": 2.0}, **_AGREE)
    d, o = default["levels"], overridden["levels"]
    assert o["entry"] == d["entry"]
    assert abs(o["entry"] - o["stop"]) > abs(d["entry"] - d["stop"])
    assert abs(o["target"] - o["entry"]) / abs(o["entry"] - o["stop"]) == 2.0


def test_confidence_is_populated_for_a_surviving_directional_call():
    result = _evaluate_with(**_AGREE)
    assert result["confidence"] is not None
    assert 0.0 <= result["confidence"] <= 1.0
    assert any("Confidence" in r and "confluence strength, not a win rate" in r for r in result["reasoning"])


def test_confidence_is_none_when_a_gate_overrides_the_call():
    result = _evaluate_with(higher_timeframe_bias="down", **_AGREE)
    assert result["verdict"] == "HOLD"
    assert result["confidence"] is None


def test_confidence_improves_when_the_higher_timeframe_agrees():
    against = _evaluate_with(higher_timeframe_bias=None, **_AGREE)
    with_agreement = _evaluate_with(higher_timeframe_bias="up", **_AGREE)
    assert with_agreement["confidence"] > against["confidence"]


def test_confidence_threshold_gate_is_inert_without_a_configured_minimum():
    result = _evaluate_with(settings={}, **_AGREE)
    assert result["verdict"] == "BUY"


def test_confidence_threshold_gate_overrides_a_low_confidence_call_to_hold():
    baseline = _evaluate_with(**_AGREE)
    threshold_above_baseline = round(baseline["confidence"] * 100) + 1
    result = _evaluate_with(settings={"min_confidence_threshold": threshold_above_baseline}, **_AGREE)
    assert result["verdict"] == "HOLD"
    assert result["confidence"] is None
    assert any("is below the configured minimum" in r for r in result["reasoning"])


def test_confidence_threshold_gate_passes_a_lenient_minimum():
    result = _evaluate_with(settings={"min_confidence_threshold": 0}, **_AGREE)
    assert result["verdict"] == "BUY"
    assert result["confidence"] is not None


# --- New in 3.1.0 (Phase 2a): structural stop/target, entry-zone gate,
# regime/market_phase — src/signals/entry_zone.py -------------------------
#
# Structural stop/target are always-on (no settings gate), so these tests
# feed the mocked structure dict a real `swings` list — struct.nearest_levels
# and every entry_zone.py function then run for real against it, unmocked.
# Every test above this point uses swings=[] and stays on the pre-3.1.0 ATR
# fallback, which is exactly the backward-compatibility guarantee.


def _swings(low_price, high_price):
    return [
        {"index": 1, "open_time": 1, "price": low_price, "kind": "low"},
        {"index": 2, "open_time": 2, "price": high_price, "kind": "high"},
    ]


def _structure_with_swings(vote, swings, regime="TRENDING"):
    return {
        "vote": vote,
        "reasons": [],
        "regime": regime,
        "swings": swings,
        "swept": None,
        "break_event": None,
        "trend_bias": None,
    }


def test_levels_prefers_structural_stop_and_target_when_given():
    levels = engine._levels("BUY", 100.0, atr=2.0, structural_stop=90.0, structural_target=115.0)
    assert levels["stop"] == 90.0
    assert levels["target"] == 115.0


def test_levels_falls_back_to_atr_math_without_structural_values():
    levels = engine._levels("BUY", 100.0, atr=2.0)
    assert levels["stop"] == 100.0 - 2.0 * engine.STOP_ATRS
    assert levels["target"] == 100.0 + 2.0 * engine.STOP_ATRS * engine.REWARD_TO_RISK


def test_rr_now_varies_with_real_structure_instead_of_being_fixed():
    # Same fixed REWARD_TO_RISK=1.5 default in both cases — with real,
    # differently-shaped nearby structure, the resulting R:R differs
    # between them, closing the Phase 1 tautology (target was always a
    # fixed multiple of the stop, so R:R never varied by construction).
    case_a = _evaluate_with(trend=(1, "up", []), structure=_structure_with_swings(1, _swings(150.0, 170.0)))
    case_b = _evaluate_with(trend=(1, "up", []), structure=_structure_with_swings(1, _swings(155.0, 175.0)))
    assert case_a["verdict"] == case_b["verdict"] == "BUY"

    def _rr(levels):
        return (levels["target"] - levels["entry"]) / (levels["entry"] - levels["stop"])

    assert abs(_rr(case_a["levels"]) - _rr(case_b["levels"])) > 0.01


def test_invalidation_and_entry_zone_populate_for_a_surviving_call():
    result = _evaluate_with(trend=(1, "up", []), structure=_structure_with_swings(1, _swings(150.0, 170.0)))
    assert result["verdict"] == "BUY"
    assert result["invalidation_level"] == 150.0
    assert result["entry_zone_low"] is not None
    assert result["entry_zone_high"] is not None
    assert result["entry_zone_low"] < result["entry_zone_high"]


def test_invalidation_and_entry_zone_are_none_on_hold():
    result = _evaluate_with()
    assert result["verdict"] == "HOLD"
    assert result["invalidation_level"] is None
    assert result["entry_zone_low"] is None
    assert result["entry_zone_high"] is None


def test_regime_and_market_phase_populate_even_on_hold():
    result = _evaluate_with()
    assert result["verdict"] == "HOLD"
    assert result["regime"] == "TRENDING"
    assert result["market_phase"] == "IMPULSE"


def test_structure_early_return_includes_break_event_and_trend_bias_keys():
    # Fewer than 2 confirmed swing highs/lows hits the early-return branch —
    # a pure ramp never produces one (see _candles()'s own docstring).
    result = engine._structure(_candles(10))
    assert result["break_event"] is None
    assert result["trend_bias"] is None


def test_entry_zone_gate_is_inert_without_a_configured_maximum():
    result = _evaluate_with(
        trend=(1, "up", []),
        structure=_structure_with_swings(1, _swings(50.0, 200.0)),
        settings={},
    )
    assert result["verdict"] == "BUY"


def test_entry_zone_gate_overrides_to_hold_when_price_has_run_too_far():
    # Support at 50 vs. a ~159 close is far beyond any reasonable ATR
    # distance, so this fires regardless of the exact ATR the ramp fixture
    # produces.
    result = _evaluate_with(
        trend=(1, "up", []),
        structure=_structure_with_swings(1, _swings(50.0, 200.0)),
        settings={"max_entry_zone_distance_atr": 1.5},
    )
    assert result["verdict"] == "HOLD"
    assert any("too far from its entry zone" in r for r in result["reasoning"])


def test_entry_zone_gate_degrades_gracefully_with_no_swings():
    # settings={} keys aside, an empty swings list (every test above this
    # section) means entry_zone() has no level to measure against, so the
    # gate stays inert even when an admin has configured a maximum.
    result = _evaluate_with(settings={"max_entry_zone_distance_atr": 0.01}, **_AGREE)
    assert result["verdict"] == "BUY"


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


EVENT = {"title": "CPI m/m", "country": "USD", "impact": "High", "event_time": 0}


def test_event_risk_override_pulls_a_buy_to_hold():
    result = {"verdict": "BUY", "reasoning": ["some bullish reason"], "levels": {"entry": 100.0}}
    updated = engine.apply_event_risk_override(result, _candles(80), EVENT, "USD")

    assert updated["verdict"] == "HOLD"
    assert any("CPI m/m" in r and "Overridden to HOLD" in r for r in updated["reasoning"])


def test_event_risk_override_recomputes_hold_style_levels():
    result = {"verdict": "SELL", "reasoning": [], "levels": {"entry": 100.0, "stop": 105.0}}
    updated = engine.apply_event_risk_override(result, _candles(80), EVENT, "USD")

    assert updated["levels"]["entry"] is None
    assert updated["levels"]["buy_above"] > updated["levels"]["sell_below"]


def test_event_risk_override_leaves_an_existing_hold_untouched():
    result = {"verdict": "HOLD", "reasoning": ["already neutral"], "levels": {"buy_above": 1, "sell_below": 0}}
    updated = engine.apply_event_risk_override(result, _candles(80), EVENT, "USD")

    assert updated == result


def test_event_risk_override_nulls_the_new_structural_fields_but_leaves_market_state_alone():
    result = {
        "verdict": "BUY",
        "reasoning": [],
        "levels": {"entry": 100.0, "stop": 95.0, "target": 110.0},
        "invalidation_level": 95.0,
        "entry_zone_low": 94.0,
        "entry_zone_high": 96.0,
        "regime": "TRENDING",
        "market_phase": "PULLBACK",
    }
    updated = engine.apply_event_risk_override(result, _candles(80), EVENT, "USD")

    assert updated["invalidation_level"] is None
    assert updated["entry_zone_low"] is None
    assert updated["entry_zone_high"] is None
    # regime/market_phase describe the market, not this call — unaffected
    # by the override, same as every other veto gate.
    assert updated["regime"] == "TRENDING"
    assert updated["market_phase"] == "PULLBACK"
