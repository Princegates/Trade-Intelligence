from unittest.mock import patch

from src.signals import engine

# Real price series are unpredictable, so the scoring/combination logic is
# tested with mocked indicator outputs; the indicators themselves are
# covered separately in test_indicators.py, and the candlestick detectors in
# test_patterns.py. Pattern detection is stubbed out here so the score under
# test is the indicator vote alone.


def _candles(n=60):
    """Plain rising candles with ordinary bodies — long enough for every
    indicator, and shaped so no pattern fires by accident."""
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


@patch("src.signals.engine.pat.detect", return_value=[])
@patch("src.signals.engine.ind.sma")
@patch("src.signals.engine.ind.macd")
@patch("src.signals.engine.ind.rsi")
def test_all_bullish_indicators_produce_buy(mock_rsi, mock_macd, mock_sma, _detect):
    mock_rsi.return_value = 50.0  # neutral, doesn't contribute
    mock_macd.return_value = {"macd": 2.0, "signal": 1.0, "prev_macd": 1.0, "prev_signal": 1.0}
    mock_sma.side_effect = [120.0, 100.0]  # sma20, sma50

    result = engine.evaluate(_candles())

    assert result["verdict"] == "BUY"
    assert result["score"] == 2


@patch("src.signals.engine.pat.detect", return_value=[])
@patch("src.signals.engine.ind.sma")
@patch("src.signals.engine.ind.macd")
@patch("src.signals.engine.ind.rsi")
def test_all_bearish_indicators_produce_sell(mock_rsi, mock_macd, mock_sma, _detect):
    mock_rsi.return_value = 50.0
    mock_macd.return_value = {"macd": -2.0, "signal": -1.0, "prev_macd": -1.0, "prev_signal": -1.0}
    mock_sma.side_effect = [80.0, 100.0]

    result = engine.evaluate(_candles())

    assert result["verdict"] == "SELL"
    assert result["score"] == -2


@patch("src.signals.engine.pat.detect", return_value=[])
@patch("src.signals.engine.ind.sma")
@patch("src.signals.engine.ind.macd")
@patch("src.signals.engine.ind.rsi")
def test_flat_indicators_produce_hold(mock_rsi, mock_macd, mock_sma, _detect):
    mock_rsi.return_value = 50.0
    mock_macd.return_value = {"macd": 1.0, "signal": 1.0, "prev_macd": 1.0, "prev_signal": 1.0}
    mock_sma.side_effect = [100.0, 100.0]

    result = engine.evaluate(_candles())

    assert result["verdict"] == "HOLD"
    assert result["score"] == 0


@patch("src.signals.engine.pat.detect", return_value=[])
@patch("src.signals.engine.ind.sma")
@patch("src.signals.engine.ind.macd")
@patch("src.signals.engine.ind.rsi")
def test_single_indicator_is_too_little_evidence_to_call_a_direction(mock_rsi, mock_macd, mock_sma, _detect):
    mock_rsi.return_value = 10.0  # strongly oversold, would score +1 on its own
    mock_macd.return_value = None  # not enough history
    mock_sma.side_effect = [None, None]

    result = engine.evaluate(_candles())

    assert result["verdict"] == "HOLD"
    assert result["evidence_count"] == 1
    assert "too little evidence" in result["reasoning"][-1]


@patch("src.signals.engine.pat.detect")
@patch("src.signals.engine.ind.sma")
@patch("src.signals.engine.ind.macd")
@patch("src.signals.engine.ind.rsi")
def test_a_candlestick_pattern_votes_like_any_other_indicator(mock_rsi, mock_macd, mock_sma, mock_detect):
    mock_rsi.return_value = 50.0
    mock_macd.return_value = {"macd": 1.0, "signal": 1.0, "prev_macd": 1.0, "prev_signal": 1.0}
    mock_sma.side_effect = [100.0, 100.0]  # flat: indicators contribute nothing
    mock_detect.return_value = [{"name": "Bullish Engulfing", "direction": 1, "note": "n"}]

    result = engine.evaluate(_candles())

    assert result["score"] == 1
    assert result["verdict"] == "BUY"
    assert result["patterns"] == ["Bullish Engulfing"]
    assert any("Bullish Engulfing" in r for r in result["reasoning"])


def test_evaluate_runs_end_to_end_on_real_data():
    result = engine.evaluate(_candles(80))
    assert result["verdict"] in {"BUY", "SELL", "HOLD"}
    assert result["reasoning"]


def test_confidence_is_absent_until_it_can_be_calibrated():
    assert engine.evaluate(_candles())["confidence"] is None


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


@patch("src.signals.engine.pat.detect", return_value=[])
@patch("src.signals.engine.ind.sma")
@patch("src.signals.engine.ind.macd")
@patch("src.signals.engine.ind.rsi")
def test_hold_reports_the_prices_that_would_change_its_mind(mock_rsi, mock_macd, mock_sma, _detect):
    mock_rsi.return_value = 50.0
    mock_macd.return_value = {"macd": 1.0, "signal": 1.0, "prev_macd": 1.0, "prev_signal": 1.0}
    mock_sma.side_effect = [100.0, 100.0]

    result = engine.evaluate(_candles(80))
    price = 100.0 + 79

    assert result["verdict"] == "HOLD"
    assert result["levels"]["buy_above"] > price
    assert result["levels"]["sell_below"] < price
