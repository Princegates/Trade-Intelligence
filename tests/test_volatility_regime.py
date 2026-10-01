from src.signals import volatility_regime


def test_none_without_atr():
    assert volatility_regime.classify(None, 2.0) is None
    assert volatility_regime.classify(2.0, None) is None
    assert volatility_regime.classify(2.0, 0) is None


def test_low_at_or_below_the_low_threshold():
    assert volatility_regime.classify(atr_val=0.7, baseline_atr_val=1.0) == "LOW"
    assert volatility_regime.classify(atr_val=0.5, baseline_atr_val=1.0) == "LOW"


def test_normal_between_thresholds():
    assert volatility_regime.classify(atr_val=1.0, baseline_atr_val=1.0) == "NORMAL"
    assert volatility_regime.classify(atr_val=1.4, baseline_atr_val=1.0) == "NORMAL"


def test_high_at_or_above_the_high_threshold():
    assert volatility_regime.classify(atr_val=1.5, baseline_atr_val=1.0) == "HIGH"
    assert volatility_regime.classify(atr_val=2.0, baseline_atr_val=1.0) == "HIGH"


def test_extreme_at_or_above_the_extreme_threshold():
    assert volatility_regime.classify(atr_val=2.5, baseline_atr_val=1.0) == "EXTREME"
    assert volatility_regime.classify(atr_val=4.0, baseline_atr_val=1.0) == "EXTREME"


def test_custom_thresholds():
    assert volatility_regime.classify(
        atr_val=1.8, baseline_atr_val=1.0, low_max=0.5, high_min=1.5, extreme_min=2.0
    ) == "HIGH"
