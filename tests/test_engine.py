from unittest.mock import patch

from src.signals import engine

# Real price series are unpredictable, so the scoring/combination logic is
# tested with mocked indicator outputs; the indicators themselves are
# covered separately in test_indicators.py.


def _closes(n=60):
    return [float(100 + i) for i in range(n)]  # just needs to be long enough


@patch("src.signals.engine.ind.sma")
@patch("src.signals.engine.ind.macd")
@patch("src.signals.engine.ind.rsi")
def test_all_bullish_indicators_produce_buy(mock_rsi, mock_macd, mock_sma):
    mock_rsi.return_value = 50.0  # neutral, doesn't contribute
    mock_macd.return_value = {"macd": 2.0, "signal": 1.0, "prev_macd": 1.0, "prev_signal": 1.0}
    mock_sma.side_effect = [120.0, 100.0]  # sma20, sma50

    result = engine.evaluate(_closes())

    assert result["verdict"] == "BUY"
    assert result["score"] == 2
    assert len(result["reasoning"]) == 3


@patch("src.signals.engine.ind.sma")
@patch("src.signals.engine.ind.macd")
@patch("src.signals.engine.ind.rsi")
def test_all_bearish_indicators_produce_sell(mock_rsi, mock_macd, mock_sma):
    mock_rsi.return_value = 50.0
    mock_macd.return_value = {"macd": -2.0, "signal": -1.0, "prev_macd": -1.0, "prev_signal": -1.0}
    mock_sma.side_effect = [80.0, 100.0]

    result = engine.evaluate(_closes())

    assert result["verdict"] == "SELL"
    assert result["score"] == -2


@patch("src.signals.engine.ind.sma")
@patch("src.signals.engine.ind.macd")
@patch("src.signals.engine.ind.rsi")
def test_flat_indicators_produce_hold(mock_rsi, mock_macd, mock_sma):
    mock_rsi.return_value = 50.0
    mock_macd.return_value = {"macd": 1.0, "signal": 1.0, "prev_macd": 1.0, "prev_signal": 1.0}
    mock_sma.side_effect = [100.0, 100.0]

    result = engine.evaluate(_closes())

    assert result["verdict"] == "HOLD"
    assert result["score"] == 0


def test_evaluate_runs_end_to_end_on_real_data():
    closes = [100 + i * 0.3 for i in range(80)]
    result = engine.evaluate(closes)
    assert result["verdict"] in {"BUY", "SELL", "HOLD"}
    assert result["reasoning"]
