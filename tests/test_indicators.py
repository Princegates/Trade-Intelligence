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


def test_ema_none_without_enough_data():
    assert ind.ema([1.0, 2.0], 9) is None


def test_ema_matches_ema_series_last_value():
    closes = [100.0 + i for i in range(30)]
    assert ind.ema(closes, 9) == ind.ema_series(closes, 9)[-1]


def test_rsi_series_last_value_matches_scalar_rsi():
    closes = [100 + (i % 7) - (i * 0.05) for i in range(60)]
    series = ind.rsi_series(closes, 14)
    assert series[-1] == ind.rsi(closes, 14)


def test_rsi_series_empty_without_enough_data():
    assert ind.rsi_series([1.0, 2.0, 3.0], 14) == []


def test_rsi_series_length_lines_up_with_closes():
    closes = [float(i) for i in range(50)]
    series = ind.rsi_series(closes, 14)
    # series[-1] lines up with closes[-1], series[-2] with closes[-2], ...
    assert len(series) == len(closes) - 14


def test_bollinger_none_without_enough_data():
    assert ind.bollinger([1.0, 2.0], 20) is None


def test_bollinger_bands_bracket_a_flat_series_mid():
    closes = [100.0] * 25
    bands = ind.bollinger(closes, 20)
    assert bands == {"mid": 100.0, "upper": 100.0, "lower": 100.0}


def test_bollinger_widens_with_volatility():
    calm = ind.bollinger([100.0] * 25, 20)
    choppy = ind.bollinger([100.0, 105.0] * 13, 20)
    assert (choppy["upper"] - choppy["lower"]) > (calm["upper"] - calm["lower"])
