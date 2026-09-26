from src.signals import htf_filter


def test_aligned_when_bias_agrees_with_a_buy():
    result = htf_filter.evaluate(verdict_direction=1, htf_bias="up", mode="downgrade")
    assert result["outcome"] == "ALIGNED"


def test_aligned_when_bias_agrees_with_a_sell():
    result = htf_filter.evaluate(verdict_direction=-1, htf_bias="down", mode="downgrade")
    assert result["outcome"] == "ALIGNED"


def test_neutral_when_bias_is_ranging():
    result = htf_filter.evaluate(verdict_direction=1, htf_bias="range", mode="strict_veto")
    assert result["outcome"] == "NEUTRAL"


def test_neutral_when_bias_is_unavailable():
    result = htf_filter.evaluate(verdict_direction=1, htf_bias=None, mode="strict_veto")
    assert result["outcome"] == "NEUTRAL"


def test_strict_veto_rejects_on_conflict():
    result = htf_filter.evaluate(verdict_direction=1, htf_bias="down", mode="strict_veto")
    assert result["outcome"] == "REJECTED"


def test_downgrade_mode_never_rejects_on_conflict():
    result = htf_filter.evaluate(verdict_direction=1, htf_bias="down", mode="downgrade")
    assert result["outcome"] == "DOWNGRADED"


def test_advisory_mode_never_rejects_on_conflict():
    result = htf_filter.evaluate(verdict_direction=1, htf_bias="down", mode="advisory")
    assert result["outcome"] == "DOWNGRADED"


def test_only_strict_veto_ever_produces_rejected():
    for mode in ("advisory", "downgrade"):
        result = htf_filter.evaluate(verdict_direction=1, htf_bias="down", mode=mode)
        assert result["outcome"] != "REJECTED"
