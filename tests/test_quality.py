from src import quality


def _candle(**overrides):
    base = {"open_time": 0, "open": 100.0, "high": 110.0, "low": 90.0, "close": 105.0, "volume": 5.0}
    return {**base, **overrides}


def test_sane_candle_passes():
    assert quality.invalid_candle(_candle()) is None


def test_high_below_body_is_rejected():
    assert "impossible OHLC" in quality.invalid_candle(_candle(high=100.0, close=105.0))


def test_low_above_body_is_rejected():
    assert "impossible OHLC" in quality.invalid_candle(_candle(low=101.0, open=100.0))


def test_inverted_high_low_is_rejected():
    assert "impossible OHLC" in quality.invalid_candle(_candle(high=50.0, low=60.0))


def test_non_positive_price_is_rejected():
    assert "non-positive price" in quality.invalid_candle(_candle(low=0.0))


def test_negative_volume_is_rejected():
    assert "negative volume" in quality.invalid_candle(_candle(volume=-1.0))


def test_first_invalid_reports_the_offending_candle():
    candles = [_candle(open_time=0), _candle(open_time=3600, high=1.0)]
    assert "3600" in quality.first_invalid(candles)


def test_first_invalid_returns_none_for_a_clean_feed():
    assert quality.first_invalid([_candle(open_time=0), _candle(open_time=3600)]) is None


# STALENESS_INTERVALS is 2, so a 1h feed is stale once the newest closed
# candle is more than 2h overdue (i.e. opened more than 3h ago).
def test_fresh_feed_is_not_stale():
    assert quality.is_stale(latest_open_time=0, now=3600 * 3, timeframe="1h") is False


def test_overdue_feed_is_stale():
    assert quality.is_stale(latest_open_time=0, now=3600 * 4, timeframe="1h") is True
