from src.signals import candle_quality


def _candle(open_, high, low, close):
    return {"open": open_, "high": high, "low": low, "close": close, "volume": 1.0}


def test_body_ratio_of_a_full_bodied_candle():
    c = _candle(100.0, 105.0, 100.0, 105.0)  # body 5, span 5
    assert candle_quality.body_ratio(c) == 1.0


def test_body_ratio_of_a_flat_candle_is_zero():
    c = _candle(100.0, 100.0, 100.0, 100.0)
    assert candle_quality.body_ratio(c) == 0.0


def test_classify_strong_for_a_decisive_body():
    c = _candle(100.0, 106.0, 99.5, 105.5)  # body 5.5, span 6.5 -> ~0.85
    assert candle_quality.classify(c) == "STRONG"


def test_classify_normal_for_a_moderate_body():
    c = _candle(100.0, 103.0, 99.5, 101.5)  # body 1.5, span 3.5 -> ~0.43
    assert candle_quality.classify(c) == "NORMAL"


def test_classify_weak_for_a_small_body():
    c = _candle(100.0, 106.0, 99.0, 100.5)  # body 0.5, span 7.0 -> ~0.07
    assert candle_quality.classify(c) == "WEAK"


def test_classify_thresholds_are_configurable():
    c = _candle(100.0, 103.0, 99.5, 101.5)  # ratio ~0.43
    assert candle_quality.classify(c, strong_ratio=0.4) == "STRONG"
    assert candle_quality.classify(c, weak_ratio=0.5) == "WEAK"
