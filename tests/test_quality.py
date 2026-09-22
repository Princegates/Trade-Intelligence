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


def test_a_stale_feed_is_retried_at_the_start_of_each_period():
    # STALE_RETRY_SECONDS is 1800, window 600: allowed in the first ten
    # minutes of each half hour.
    assert quality.due_for_stale_retry(now=1800 * 4) is True
    assert quality.due_for_stale_retry(now=1800 * 4 + 599) is True


def test_a_stale_feed_is_left_alone_for_the_rest_of_the_period():
    assert quality.due_for_stale_retry(now=1800 * 4 + 600) is False
    assert quality.due_for_stale_retry(now=1800 * 4 + 1799) is False


def test_the_retry_window_is_wide_enough_for_a_five_minute_poll():
    # A poller stepping in 300s must land in the window, or a dead feed is
    # never retried at all.
    from src import config

    assert config.STALE_RETRY_WINDOW >= 300
    hits = sum(1 for t in range(0, config.STALE_RETRY_SECONDS, 300) if quality.due_for_stale_retry(t))
    assert hits >= 1


def test_latest_closed_candle_is_the_one_before_the_forming_one():
    # 10:30 into the hour: 10:00 is still forming, 09:00 is the last closed.
    assert quality.latest_closed_open_time(now=3600 * 10 + 1800, timeframe="1h") == 3600 * 9


def test_latest_closed_candle_on_an_exact_boundary():
    # Exactly 10:00: the 10:00 candle has only just opened.
    assert quality.latest_closed_open_time(now=3600 * 10, timeframe="1h") == 3600 * 9


def test_latest_closed_candle_is_unchanged_across_a_short_poll_interval():
    # The point of the check: five minutes apart, a daily candle is the same
    # one, so there is nothing for a second request to return.
    day = 86400
    assert quality.latest_closed_open_time(now=day * 5 + 300, timeframe="1d") == quality.latest_closed_open_time(
        now=day * 5 + 600, timeframe="1d"
    )
