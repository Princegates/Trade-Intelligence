import pytest

from src import config, run
from src.storage import db

HOUR = 3600
INSTRUMENT = {"symbol": "BTCUSDT", "provider": "binance", "provider_symbol": "BTCUSDT", "timeframes": ["1h"]}
GOLD = {"symbol": "XAUUSD", "provider": "twelvedata", "provider_symbol": "XAU/USD", "timeframes": ["1h"]}
NOW = 1_700_000_000


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    db.init_db()


def _feed(count, now):
    """`count` hourly candles, the last of which is still forming at `now`."""
    candles = []
    for i in range(count):
        open_time = now - (count - 1 - i) * HOUR
        price = 100.0 + i
        candles.append(
            {
                "open_time": open_time,
                "open": price,
                "high": price + 1,
                "low": price - 1,
                "close": price,
                "volume": 10.0,
                "complete": open_time + HOUR <= now,
            }
        )
    return candles


def _serve(monkeypatch, feed):
    monkeypatch.setattr(run, "fetch_candles", lambda instrument, timeframe: feed)


def test_signal_is_priced_off_the_closed_candle_not_the_forming_one(temp_db, monkeypatch):
    feed = _feed(61, NOW)
    _serve(monkeypatch, feed)

    run.process(INSTRUMENT, "1h", NOW)

    history = db.signal_history("BTCUSDT", "1h")
    assert len(history) == 1
    last_closed = [c for c in feed if c["complete"]][-1]
    assert history[0][1] == last_closed["close"]
    assert history[0][1] != feed[-1]["close"]


def test_no_request_is_spent_when_no_new_candle_can_have_closed(temp_db, monkeypatch):
    """The binding constraint on a free data plan is requests, not compute."""
    fetches = []

    def counting_fetch(instrument, timeframe):
        fetches.append(timeframe)
        return _feed(61, NOW)

    monkeypatch.setattr(run, "fetch_candles", counting_fetch)

    run.process(INSTRUMENT, "1h", NOW)
    assert len(fetches) == 1

    # Five minutes later the same 1h candle is still the newest closed one.
    run.process(INSTRUMENT, "1h", NOW + 300)
    assert len(fetches) == 1


def test_a_request_is_spent_once_a_new_candle_closes(temp_db, monkeypatch):
    fetches = []

    def counting_fetch(instrument, timeframe):
        fetches.append(timeframe)
        return _feed(61, NOW + HOUR)

    monkeypatch.setattr(run, "fetch_candles", lambda i, tf: _feed(61, NOW))
    run.process(INSTRUMENT, "1h", NOW)

    monkeypatch.setattr(run, "fetch_candles", counting_fetch)
    run.process(INSTRUMENT, "1h", NOW + HOUR)
    assert len(fetches) == 1


def test_stale_feed_suppresses_instead_of_publishing(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(61, NOW))

    message = run.process(INSTRUMENT, "1h", NOW + 10 * HOUR)

    assert "stale feed" in message
    assert db.signal_history("BTCUSDT", "1h") == []


def test_impossible_candle_rejects_the_whole_feed(temp_db, monkeypatch):
    feed = _feed(61, NOW)
    feed[10]["high"] = 0.0
    _serve(monkeypatch, feed)

    message = run.process(INSTRUMENT, "1h", NOW)

    assert "rejected feed" in message
    assert db.signal_history("BTCUSDT", "1h") == []


def test_short_history_suppresses(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(10, NOW))

    message = run.process(INSTRUMENT, "1h", NOW)

    assert "need 60" in message
    assert db.signal_history("BTCUSDT", "1h") == []


def test_every_suppression_leaves_a_reason_behind(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(10, NOW))
    run.process(INSTRUMENT, "1h", NOW)

    with db.connect() as conn:
        reasons = conn.execute("SELECT reason FROM signal_suppressions").fetchall()

    assert reasons == [("INSUFFICIENT_HISTORY",)]


def test_nothing_is_done_when_the_latest_closed_candle_is_already_stored(temp_db, monkeypatch):
    """Nothing new to fetch also means nothing new to evaluate — the signal
    for that candle was published by the run that first saw it."""
    _serve(monkeypatch, _feed(61, NOW))
    run.process(INSTRUMENT, "1h", NOW)

    monkeypatch.setattr(run, "fetch_candles", lambda i, tf: pytest.fail("should not fetch"))
    message = run.process(INSTRUMENT, "1h", NOW + 1200)

    assert "[current]" in message
    assert len(db.signal_history("BTCUSDT", "1h")) == 1


def test_candles_are_mirrored_only_after_the_signal_lands(temp_db, monkeypatch):
    """The mirrored candle is what tells the next run to stand down, so it
    must not appear while the signal it belongs to is missing."""
    _serve(monkeypatch, _feed(61, NOW))
    order = []
    monkeypatch.setattr(run.supabase, "publish_signal", lambda *a, **k: order.append("signal"))
    monkeypatch.setattr(run.supabase, "publish_candles", lambda *a, **k: order.append("candles"))

    run.process(INSTRUMENT, "1h", NOW)

    assert order == ["signal", "candles"]


def test_a_failed_signal_publish_leaves_the_candles_unmirrored(temp_db, monkeypatch):
    """Otherwise the next run sees a stored candle, skips, and the signal is
    lost for good rather than retried."""
    _serve(monkeypatch, _feed(61, NOW))
    mirrored = []

    def failing_signal(*a, **k):
        raise RuntimeError("supabase unreachable")

    monkeypatch.setattr(run.supabase, "publish_signal", failing_signal)
    monkeypatch.setattr(run.supabase, "publish_candles", lambda *a, **k: mirrored.append(1))

    run.process(INSTRUMENT, "1h", NOW)

    assert mirrored == []


def test_the_mirror_decides_what_is_already_stored_when_configured(temp_db, monkeypatch):
    """On a fresh runner the local file is whatever was last checked in, so
    asking it would refetch every series on every run."""
    monkeypatch.setattr(run.supabase, "is_configured", lambda: True)
    monkeypatch.setattr(run.supabase, "newest_mirrored_candle", lambda s, tf: NOW - HOUR)

    assert run.newest_stored("BTCUSDT", "1h") == NOW - HOUR


def test_an_unreadable_mirror_falls_back_to_local_history(temp_db, monkeypatch):
    monkeypatch.setattr(run.supabase, "is_configured", lambda: True)

    def unreachable(symbol, timeframe):
        raise RuntimeError("network down")

    monkeypatch.setattr(run.supabase, "newest_mirrored_candle", unreachable)
    db.upsert_candles("BTCUSDT", "1h", _feed(2, NOW))

    assert run.newest_stored("BTCUSDT", "1h") is not None


def test_a_closed_market_is_not_retried_every_poll(temp_db, monkeypatch):
    """Gold has no weekend candles, so an unthrottled retry spends the whole
    daily allowance being told there is nothing new."""
    _serve(monkeypatch, _feed(61, NOW))
    run.process(INSTRUMENT, "1h", NOW)

    # Days later: the feed is long stale, and this poll is mid-period.
    much_later = (NOW + 86400 * 2) // 1800 * 1800 + 900
    monkeypatch.setattr(run, "fetch_candles", lambda i, tf: pytest.fail("should not fetch"))

    message = run.process(INSTRUMENT, "1h", much_later)
    assert "[waiting]" in message


def test_a_closed_market_is_still_retried_in_the_window(temp_db, monkeypatch):
    """Throttling must not mean never — a reopening has to be noticed."""
    _serve(monkeypatch, _feed(61, NOW))
    run.process(INSTRUMENT, "1h", NOW)

    fetches = []
    in_window = (NOW + 86400 * 2) // 1800 * 1800

    def counting(instrument, timeframe):
        fetches.append(timeframe)
        return _feed(61, NOW)

    monkeypatch.setattr(run, "fetch_candles", counting)
    run.process(INSTRUMENT, "1h", in_window)

    assert len(fetches) == 1


def test_a_fresh_feed_is_never_throttled(temp_db, monkeypatch):
    """The throttle applies to stale feeds only; a live market must not be
    held off just because the clock is mid-period."""
    fetches = []

    def counting(instrument, timeframe):
        fetches.append(timeframe)
        return _feed(61, NOW + HOUR)

    _serve(monkeypatch, _feed(61, NOW))
    run.process(INSTRUMENT, "1h", NOW)

    monkeypatch.setattr(run, "fetch_candles", counting)
    mid_period = NOW + HOUR
    run.process(INSTRUMENT, "1h", mid_period)

    assert len(fetches) == 1


def _buy_result():
    return {
        "verdict": "BUY",
        "score": 2,
        "reasoning": ["fake bullish reason"],
        "evidence_count": 3,
        "confidence": None,
        "patterns": [],
        "levels": {"entry": 100.0, "stop": 95.0, "target": 107.5, "buy_above": None, "sell_below": None},
    }


def test_a_high_impact_event_pulls_a_gold_buy_to_hold(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles: _buy_result())

    events = [{"title": "CPI m/m", "country": "USD", "impact": "High", "event_time": NOW}]
    message = run.process(GOLD, "1h", NOW, events=events)

    assert "XAUUSD/1h: HOLD" in message
    assert "CPI m/m" in message


def test_an_event_outside_the_window_leaves_the_call_untouched(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles: _buy_result())

    events = [{"title": "CPI m/m", "country": "USD", "impact": "High", "event_time": NOW - 100 * HOUR}]
    message = run.process(GOLD, "1h", NOW, events=events)

    assert message.startswith("XAUUSD/1h: BUY")


def test_a_medium_impact_event_never_gates_a_call(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles: _buy_result())

    events = [{"title": "Retail Sales", "country": "USD", "impact": "Medium", "event_time": NOW}]
    message = run.process(GOLD, "1h", NOW, events=events)

    assert message.startswith("XAUUSD/1h: BUY")


def test_btc_is_never_gated_by_the_calendar(temp_db, monkeypatch):
    """BTC has no currency mapped in EVENT_RISK_CURRENCY at all — the same
    event that would hold gold back must not touch it."""
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles: _buy_result())

    events = [{"title": "CPI m/m", "country": "USD", "impact": "High", "event_time": NOW}]
    message = run.process(INSTRUMENT, "1h", NOW, events=events)

    assert message.startswith("BTCUSDT/1h: BUY")


def test_no_events_passed_defaults_to_no_gate(temp_db, monkeypatch):
    """The default is empty, not None, so a caller that forgets `events`
    entirely (every test above this one) never crashes on it."""
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles: _buy_result())

    message = run.process(GOLD, "1h", NOW)

    assert message.startswith("XAUUSD/1h: BUY")


def test_event_risk_currency_maps_gold_to_usd_only():
    assert config.EVENT_RISK_CURRENCY == {"XAUUSD": "USD"}
