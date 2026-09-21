from src.signals import indicators as ind


def test_sma():
    assert ind.sma([1, 2, 3, 4, 5], 5) == 3
    assert ind.sma([1, 2], 5) is None


def test_rsi_all_gains_hits_100():
    closes = [float(i) for i in range(1, 30)]
    assert ind.rsi(closes, 14) == 100.0


def test_rsi_all_losses_hits_0():
    closes = [float(i) for i in range(30, 1, -1)]
    assert ind.rsi(closes, 14) == 0.0


def test_rsi_none_without_enough_data():
    assert ind.rsi([1.0, 2.0, 3.0], 14) is None


def test_macd_none_without_enough_data():
    assert ind.macd([1.0] * 10) is None


def test_macd_returns_expected_keys():
    closes = [100 + (i % 5) - (i * 0.1) for i in range(60)]
    result = ind.macd(closes)
    assert result is not None
    assert set(result) == {"macd", "signal", "prev_macd", "prev_signal", "histogram"}
