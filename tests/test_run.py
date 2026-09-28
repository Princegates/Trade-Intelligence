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
        "regime": "TRENDING",
        "market_phase": "IMPULSE",
        "invalidation_level": None,
        "entry_zone_low": None,
        "entry_zone_high": None,
    }


def test_a_high_impact_event_pulls_a_gold_buy_to_hold(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles, **kwargs: _buy_result())

    events = [{"title": "CPI m/m", "country": "USD", "impact": "High", "event_time": NOW}]
    message = run.process(GOLD, "1h", NOW, events=events)

    assert "XAUUSD/1h: HOLD" in message
    assert "CPI m/m" in message


def test_an_event_outside_the_window_leaves_the_call_untouched(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles, **kwargs: _buy_result())

    events = [{"title": "CPI m/m", "country": "USD", "impact": "High", "event_time": NOW - 100 * HOUR}]
    message = run.process(GOLD, "1h", NOW, events=events)

    assert message.startswith("XAUUSD/1h: BUY")


def test_a_medium_impact_event_never_gates_a_call(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles, **kwargs: _buy_result())

    events = [{"title": "Retail Sales", "country": "USD", "impact": "Medium", "event_time": NOW}]
    message = run.process(GOLD, "1h", NOW, events=events)

    assert message.startswith("XAUUSD/1h: BUY")


def test_btc_is_never_gated_by_the_calendar(temp_db, monkeypatch):
    """BTC has no currency mapped in EVENT_RISK_CURRENCY at all — the same
    event that would hold gold back must not touch it."""
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles, **kwargs: _buy_result())

    events = [{"title": "CPI m/m", "country": "USD", "impact": "High", "event_time": NOW}]
    message = run.process(INSTRUMENT, "1h", NOW, events=events)

    assert message.startswith("BTCUSDT/1h: BUY")


def test_no_events_passed_defaults_to_no_gate(temp_db, monkeypatch):
    """The default is empty, not None, so a caller that forgets `events`
    entirely (every test above this one) never crashes on it."""
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles, **kwargs: _buy_result())

    message = run.process(GOLD, "1h", NOW)

    assert message.startswith("XAUUSD/1h: BUY")


def test_event_risk_currency_maps_gold_to_usd_only():
    assert config.EVENT_RISK_CURRENCY == {"XAUUSD": "USD"}


# --- New in 3.0.0: confluence anchor wiring + engine_settings threading ---


def test_process_works_with_no_engine_settings_argument(temp_db, monkeypatch):
    """Every call above this point omits engine_settings entirely — the
    default must keep working exactly as it did before this parameter
    existed."""
    _serve(monkeypatch, _feed(61, NOW))
    message = run.process(INSTRUMENT, "1h", NOW)
    assert "1h" in message


# The same descending zigzag verified in test_confluence.py to read as a
# clear "down" bias — reused here as seeded anchor-timeframe history.
_ZIGZAG_DOWN = [220 - p for p in [100, 105, 110, 105, 100, 110, 120, 112, 104, 115, 130, 121, 112]]


def _seed_anchor_candles(symbol, anchor_timeframe, prices, start=0, step=86400):
    candles = [
        {
            "open_time": start + i * step,
            "open": p - 0.1,
            "high": p + 0.3,
            "low": p - 0.3,
            "close": p + 0.1,
            "volume": 1.0,
            "complete": True,
        }
        for i, p in enumerate(prices)
    ]
    db.upsert_candles(symbol, anchor_timeframe, candles)


def test_process_reads_the_anchor_timeframes_bias_from_local_storage(temp_db, monkeypatch):
    """The wiring seam: process() looks up confluence.ANCHOR_TIMEFRAME for
    the timeframe being evaluated (1d, for a 1h call), reads that
    timeframe's own stored candles, and passes the resulting bias into
    engine.evaluate() — not re-testing bias detection itself
    (test_confluence.py) or gate logic (test_engine.py), just that
    process() connects the two for the right anchor and falls back to
    local SQLite when Supabase isn't configured (as in every test here)."""
    _serve(monkeypatch, _feed(61, NOW))
    _seed_anchor_candles("BTCUSDT", "1d", _ZIGZAG_DOWN)

    received = {}

    def capture_evaluate(candles, **kwargs):
        received.update(kwargs)
        return {
            "verdict": "HOLD",
            "score": 0,
            "reasoning": ["captured"],
            "evidence_count": 0,
            "confidence": None,
            "patterns": [],
            "levels": None,
            "regime": "RANGING",
            "market_phase": "CONSOLIDATION",
            "invalidation_level": None,
            "entry_zone_low": None,
            "entry_zone_high": None,
        }

    monkeypatch.setattr(run.engine, "evaluate", capture_evaluate)

    run.process(INSTRUMENT, "1h", NOW)

    assert received.get("higher_timeframe_bias") == "down"


def test_process_finds_no_anchor_bias_when_none_is_stored(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(61, NOW))

    received = {}
    monkeypatch.setattr(
        run.engine,
        "evaluate",
        lambda candles, **kwargs: (received.update(kwargs), _buy_result())[1],
    )

    run.process(INSTRUMENT, "1h", NOW)

    assert received.get("higher_timeframe_bias") is None


def test_the_1d_timeframe_has_no_anchor_to_read():
    """1d is the top of the fetched stack — nothing higher exists to check
    against, so process() must not attempt an anchor read for it."""
    from src.signals import confluence

    assert confluence.ANCHOR_TIMEFRAME["1d"] is None


def test_engine_settings_are_threaded_through_to_evaluate(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(61, NOW))

    received = {}

    def capture_evaluate(candles, **kwargs):
        received.update(kwargs)
        return {
            "verdict": "HOLD",
            "score": 0,
            "reasoning": ["captured"],
            "evidence_count": 0,
            "confidence": None,
            "patterns": [],
            "levels": None,
            "regime": "RANGING",
            "market_phase": "CONSOLIDATION",
            "invalidation_level": None,
            "entry_zone_low": None,
            "entry_zone_high": None,
        }

    monkeypatch.setattr(run.engine, "evaluate", capture_evaluate)

    settings = {"min_confidence_threshold": 70}
    run.process(INSTRUMENT, "1h", NOW, engine_settings=settings)

    assert received.get("settings") == settings


# --- New in 3.1.0 (Phase 2b): lifecycle row creation + recheck_lifecycles ---


def _tracked_buy_result():
    """A BUY with real structural data — the shape lifecycle.tracks()
    requires. _buy_result() above is deliberately the opposite (ATR-
    fallback, no structural fields) and is reused as-is for the "no row"
    test below."""
    result = _buy_result()
    result["invalidation_level"] = 94.0
    result["entry_zone_low"] = 99.0
    result["entry_zone_high"] = 101.0
    return result


def test_a_tracked_signal_gets_a_wait_lifecycle_row(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles, **kwargs: _tracked_buy_result())
    monkeypatch.setattr(run.supabase, "publish_signal", lambda *a, **k: True)

    lifecycle_calls = []
    monkeypatch.setattr(run.supabase, "publish_lifecycle", lambda *a, **k: lifecycle_calls.append(a))

    run.process(INSTRUMENT, "1h", NOW)

    assert len(lifecycle_calls) == 1
    symbol, timeframe, candle_time, strategy_version, state, entered_at, updated_at, price, last_checked = lifecycle_calls[0]
    assert (symbol, timeframe, state) == ("BTCUSDT", "1h", "WAIT")


def test_an_atr_fallback_signal_gets_no_lifecycle_row(temp_db, monkeypatch):
    # _buy_result() (not _tracked_buy_result()) has no structural fields —
    # nothing for WAIT/WATCH/READY to describe.
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles, **kwargs: _buy_result())
    monkeypatch.setattr(run.supabase, "publish_signal", lambda *a, **k: True)

    lifecycle_calls = []
    monkeypatch.setattr(run.supabase, "publish_lifecycle", lambda *a, **k: lifecycle_calls.append(a))

    run.process(INSTRUMENT, "1h", NOW)

    assert lifecycle_calls == []


def test_a_hold_signal_gets_no_lifecycle_row(temp_db, monkeypatch):
    hold_result = {
        "verdict": "HOLD",
        "score": 0,
        "reasoning": ["neutral"],
        "evidence_count": 0,
        "confidence": None,
        "patterns": [],
        "levels": None,
        "regime": "RANGING",
        "market_phase": "CONSOLIDATION",
        "invalidation_level": None,
        "entry_zone_low": None,
        "entry_zone_high": None,
    }
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles, **kwargs: hold_result)
    monkeypatch.setattr(run.supabase, "publish_signal", lambda *a, **k: True)

    lifecycle_calls = []
    monkeypatch.setattr(run.supabase, "publish_lifecycle", lambda *a, **k: lifecycle_calls.append(a))

    run.process(INSTRUMENT, "1h", NOW)

    assert lifecycle_calls == []


def test_a_re_sent_signal_does_not_get_a_second_lifecycle_row(temp_db, monkeypatch):
    # publish_signal succeeding on a re-poll that finds nothing new
    # (stored=False) must not re-create the row — mirrors the existing
    # "only for a signal this run actually just recorded" commentary gate.
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles, **kwargs: _tracked_buy_result())
    monkeypatch.setattr(run.supabase, "publish_signal", lambda *a, **k: True)

    lifecycle_calls = []
    monkeypatch.setattr(run.supabase, "publish_lifecycle", lambda *a, **k: lifecycle_calls.append(a))

    run.process(INSTRUMENT, "1h", NOW)
    assert len(lifecycle_calls) == 1

    run.process(INSTRUMENT, "1h", NOW)  # same candle, nothing new
    assert len(lifecycle_calls) == 1


def _lifecycle_row(state="WATCH", symbol="BTCUSDT", timeframe="1h", candle_time=0, entered_at=0):
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "candle_time": candle_time,
        "strategy_version": "3.1.0",
        "state": state,
        "entered_at": entered_at,
    }


def _tracked_signal(entry=100.0, stop=95.0, inval=94.0, zone_low=99.0, zone_high=101.0, candle_time=0):
    return {
        "verdict": "BUY",
        "entry": entry,
        "stop": stop,
        "candle_time": candle_time,
        "invalidation_level": inval,
        "entry_zone_low": zone_low,
        "entry_zone_high": zone_high,
    }


def test_recheck_lifecycles_advances_a_row_and_logs_the_transition(monkeypatch):
    monkeypatch.setattr(run.supabase, "get_open_lifecycle_rows", lambda: [_lifecycle_row("WATCH")])
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda symbol, timeframe, limit=1: [{"close": 100.0, "open_time": HOUR}])
    monkeypatch.setattr(run.supabase, "get_signal_by_identity", lambda *a: _tracked_signal())

    lifecycle_calls = []
    transition_calls = []
    monkeypatch.setattr(run.supabase, "publish_lifecycle", lambda *a, **k: lifecycle_calls.append(a))
    monkeypatch.setattr(run.supabase, "publish_lifecycle_transition", lambda *a, **k: transition_calls.append(a))

    run.recheck_lifecycles(NOW, engine_settings=None)

    assert len(lifecycle_calls) == 1
    assert lifecycle_calls[0][4] == "READY"  # price 100.0 sits inside the [99, 101] zone
    assert len(transition_calls) == 1
    assert transition_calls[0][4:6] == ("WATCH", "READY")


def test_recheck_lifecycles_does_not_log_a_transition_when_the_state_is_unchanged(monkeypatch):
    monkeypatch.setattr(run.supabase, "get_open_lifecycle_rows", lambda: [_lifecycle_row("WAIT")])
    # Price far from the zone and not favorable enough to confirm — stays WAIT.
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda symbol, timeframe, limit=1: [{"close": 104.0, "open_time": HOUR}])
    monkeypatch.setattr(run.supabase, "get_signal_by_identity", lambda *a: _tracked_signal())

    lifecycle_calls = []
    transition_calls = []
    monkeypatch.setattr(run.supabase, "publish_lifecycle", lambda *a, **k: lifecycle_calls.append(a))
    monkeypatch.setattr(run.supabase, "publish_lifecycle_transition", lambda *a, **k: transition_calls.append(a))

    run.recheck_lifecycles(NOW, engine_settings=None)

    assert lifecycle_calls[0][4] == "WAIT"
    assert transition_calls == []


def test_recheck_lifecycles_skips_a_row_with_no_current_candle(monkeypatch):
    monkeypatch.setattr(run.supabase, "get_open_lifecycle_rows", lambda: [_lifecycle_row("WAIT")])
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda symbol, timeframe, limit=1: [])
    monkeypatch.setattr(run.supabase, "get_signal_by_identity", lambda *a: _tracked_signal())

    lifecycle_calls = []
    monkeypatch.setattr(run.supabase, "publish_lifecycle", lambda *a, **k: lifecycle_calls.append(a))

    run.recheck_lifecycles(NOW, engine_settings=None)

    assert lifecycle_calls == []


def test_recheck_lifecycles_skips_a_row_whose_signal_is_missing(monkeypatch):
    monkeypatch.setattr(run.supabase, "get_open_lifecycle_rows", lambda: [_lifecycle_row("WAIT")])
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda symbol, timeframe, limit=1: [{"close": 100.0, "open_time": HOUR}])
    monkeypatch.setattr(run.supabase, "get_signal_by_identity", lambda *a: None)

    lifecycle_calls = []
    monkeypatch.setattr(run.supabase, "publish_lifecycle", lambda *a, **k: lifecycle_calls.append(a))

    run.recheck_lifecycles(NOW, engine_settings=None)

    assert lifecycle_calls == []


def test_recheck_lifecycles_reuses_one_candle_read_per_symbol_timeframe(monkeypatch):
    # Two open rows sharing the same symbol/timeframe must only spend one
    # get_recent_candles call between them.
    monkeypatch.setattr(
        run.supabase,
        "get_open_lifecycle_rows",
        lambda: [_lifecycle_row("WATCH", candle_time=0), _lifecycle_row("WAIT", candle_time=HOUR)],
    )
    calls = []

    def counting_get_recent_candles(symbol, timeframe, limit=1):
        calls.append((symbol, timeframe))
        return [{"close": 100.0, "open_time": HOUR}]

    monkeypatch.setattr(run.supabase, "get_recent_candles", counting_get_recent_candles)
    monkeypatch.setattr(run.supabase, "get_signal_by_identity", lambda *a: _tracked_signal(candle_time=a[2]))
    monkeypatch.setattr(run.supabase, "publish_lifecycle", lambda *a, **k: None)
    monkeypatch.setattr(run.supabase, "publish_lifecycle_transition", lambda *a, **k: None)

    run.recheck_lifecycles(NOW, engine_settings=None)

    assert len(calls) == 1


def test_recheck_lifecycles_is_a_no_op_with_no_open_rows(monkeypatch):
    monkeypatch.setattr(run.supabase, "get_open_lifecycle_rows", lambda: [])
    calls = []
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda *a, **k: calls.append(1))

    run.recheck_lifecycles(NOW, engine_settings=None)

    assert calls == []


# --- New in GUDA SPECIAL Phase 1a: detect_guda_special_setups / advance_guda_special_setups ---


def test_detect_guda_special_setups_creates_a_setup_row(monkeypatch):
    candles = [{"open_time": i * 900, "close": 100.0 + i} for i in range(61)]
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda symbol, timeframe, limit: candles)
    monkeypatch.setattr(
        run.setups,
        "detect_new_setups",
        lambda candles, settings=None: {
            "bos_candle_time": 54000, "bos_kind": "BOS", "bos_direction": 1, "bos_price": 150.0, "break_strength": "STRONG",
        },
    )

    calls = []
    monkeypatch.setattr(run.supabase, "publish_guda_special_setup", lambda *a, **k: calls.append((a, k)))

    run.detect_guda_special_setups(NOW, guda_special_settings=None)

    assert len(calls) == 2  # one BTCUSDT, one XAUUSD (both in config.INSTRUMENTS)
    args, kwargs = calls[0]
    assert args[1] == "BTCUSDT"
    assert args[2] == "15m"
    assert args[5] == "BOS"  # bos_kind
    assert kwargs["resolution"] == "ignore-duplicates"


def test_detect_guda_special_setups_skips_with_insufficient_history(monkeypatch):
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda symbol, timeframe, limit: [{"open_time": 0, "close": 100.0}])
    detect_calls = []
    monkeypatch.setattr(run.setups, "detect_new_setups", lambda *a, **k: detect_calls.append(1))

    run.detect_guda_special_setups(NOW, guda_special_settings=None)

    assert detect_calls == []


def test_detect_guda_special_setups_is_a_no_op_without_a_break(monkeypatch):
    candles = [{"open_time": i * 900, "close": 100.0 + i} for i in range(61)]
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda symbol, timeframe, limit: candles)
    monkeypatch.setattr(run.setups, "detect_new_setups", lambda *a, **k: None)
    publish_calls = []
    monkeypatch.setattr(run.supabase, "publish_guda_special_setup", lambda *a, **k: publish_calls.append(1))

    run.detect_guda_special_setups(NOW, guda_special_settings=None)

    assert publish_calls == []


def _open_setup(symbol="BTCUSDT", timeframe="15m", state="RETEST_PENDING"):
    return {
        "id": "11111111-1111-1111-1111-111111111111",
        "symbol": symbol, "timeframe": timeframe, "strategy_version": config.GUDA_SPECIAL_STRATEGY_VERSION,
        "bos_candle_time": 0, "bos_kind": "BOS", "bos_direction": 1, "bos_price": 100.0,
        "break_strength": "STRONG", "state": state,
        "impulse_start_price": 90.0, "impulse_end_price": 100.0, "impulse_atr_multiple": 5.0,
        "fib_50": 95.0, "fib_61_8": 93.82, "fib_72": 92.8, "fib_78_6": 92.14,
        "entered_at": 0,
    }


def test_advance_guda_special_setups_publishes_setup_and_signal_on_a_state_change(monkeypatch):
    monkeypatch.setattr(run.supabase, "get_open_guda_special_setups", lambda: [_open_setup()])
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda symbol, timeframe, limit: [{"open_time": HOUR, "close": 101.0}])

    signal = {"verdict": "BUY", "price": 101.0, "no_trade_reason": None, "bos_kind": "BOS", "bos_direction": 1,
              "bos_price": 100.0, "break_strength": "STRONG", "impulse_start_price": 90.0, "impulse_end_price": 100.0,
              "impulse_atr_multiple": 5.0, "fib_50": 95.0, "fib_61_8": 93.82, "fib_72": 92.8, "fib_78_6": 92.14,
              "retracement_quality": "VALID", "retest_confirmed": True, "confirmation_pattern": "Bullish Engulfing",
              "candle_quality": "STRONG", "htf_bias": "up", "htf_filter_outcome": "ALIGNED", "entry": 101.0,
              "stop": 98.0, "target": 107.0, "risk_reward": 2.0, "regime": "TRENDING"}

    monkeypatch.setattr(
        run.setups, "advance_setup",
        lambda setup, candles, htf_candles, timeframe_seconds, settings=None, event_blackout=None: (
            {"setup": {**setup, "state": "PUBLISHED"}, "signal": signal}
        ),
    )

    setup_calls, transition_calls, signal_calls = [], [], []
    monkeypatch.setattr(run.supabase, "publish_guda_special_setup", lambda *a, **k: setup_calls.append((a, k)))
    monkeypatch.setattr(run.supabase, "publish_guda_special_setup_transition", lambda *a, **k: transition_calls.append(a))
    monkeypatch.setattr(run.supabase, "publish_guda_special_signal", lambda *a, **k: signal_calls.append((a, k)))

    run.advance_guda_special_setups(NOW, guda_special_settings=None)

    assert len(setup_calls) == 1
    assert setup_calls[0][0][9] == "PUBLISHED"  # state positional arg
    assert len(transition_calls) == 1
    assert transition_calls[0][1:3] == ("RETEST_PENDING", "PUBLISHED")
    assert len(signal_calls) == 1
    assert signal_calls[0][1]["verdict"] == "BUY"


def test_a_published_guda_special_trade_starts_a_tracked_trade(monkeypatch):
    monkeypatch.setattr(run.supabase, "get_open_guda_special_setups", lambda: [_open_setup()])
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda symbol, timeframe, limit: [{"open_time": HOUR, "close": 101.0}])
    signal = {"verdict": "BUY", "entry": 101.0, "stop": 98.0, "target": 107.0}
    monkeypatch.setattr(
        run.setups, "advance_setup",
        lambda setup, candles, htf_candles, timeframe_seconds, settings=None, event_blackout=None: (
            {"setup": {**setup, "state": "PUBLISHED"}, "signal": signal}
        ),
    )
    for name in ("publish_guda_special_setup", "publish_guda_special_setup_transition", "publish_guda_special_signal"):
        monkeypatch.setattr(run.supabase, name, lambda *a, **k: None)
    opened = []
    monkeypatch.setattr(run, "open_trade_outcome", lambda *a, **k: opened.append(a))

    run.advance_guda_special_setups(NOW, guda_special_settings=None)

    assert len(opened) == 1
    source, symbol, timeframe, version, signal_time, verdict, levels = opened[0]
    assert (source, verdict, signal_time) == ("guda_special", "BUY", HOUR)
    assert (levels["entry"], levels["stop"], levels["target"]) == (101.0, 98.0, 107.0)


def test_advance_guda_special_setups_does_not_log_a_transition_when_unchanged(monkeypatch):
    monkeypatch.setattr(run.supabase, "get_open_guda_special_setups", lambda: [_open_setup(state="AWAITING_CONFIRMATION")])
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda symbol, timeframe, limit: [{"open_time": HOUR, "close": 96.0}])
    monkeypatch.setattr(
        run.setups, "advance_setup",
        lambda setup, candles, htf_candles, timeframe_seconds, settings=None, event_blackout=None: (
            {"setup": {**setup, "state": "AWAITING_CONFIRMATION"}, "signal": None}
        ),
    )

    transition_calls, signal_calls = [], []
    monkeypatch.setattr(run.supabase, "publish_guda_special_setup", lambda *a, **k: None)
    monkeypatch.setattr(run.supabase, "publish_guda_special_setup_transition", lambda *a, **k: transition_calls.append(1))
    monkeypatch.setattr(run.supabase, "publish_guda_special_signal", lambda *a, **k: signal_calls.append(1))

    run.advance_guda_special_setups(NOW, guda_special_settings=None)

    assert transition_calls == []
    assert signal_calls == []


def test_advance_guda_special_setups_skips_a_pair_with_no_candles(monkeypatch):
    monkeypatch.setattr(run.supabase, "get_open_guda_special_setups", lambda: [_open_setup()])
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda symbol, timeframe, limit: [])
    advance_calls = []
    monkeypatch.setattr(run.setups, "advance_setup", lambda *a, **k: advance_calls.append(1))

    run.advance_guda_special_setups(NOW, guda_special_settings=None)

    assert advance_calls == []


def test_advance_guda_special_setups_reuses_candle_reads_across_setups_sharing_a_pair(monkeypatch):
    monkeypatch.setattr(
        run.supabase, "get_open_guda_special_setups",
        lambda: [_open_setup(state="RETEST_PENDING"), _open_setup(state="AWAITING_CONFIRMATION")],
    )
    calls = []

    def counting_get_recent_candles(symbol, timeframe, limit):
        calls.append((symbol, timeframe))
        return [{"open_time": HOUR, "close": 96.0}]

    monkeypatch.setattr(run.supabase, "get_recent_candles", counting_get_recent_candles)
    monkeypatch.setattr(
        run.setups, "advance_setup",
        lambda setup, candles, htf_candles, timeframe_seconds, settings=None, event_blackout=None: {"setup": setup, "signal": None},
    )
    monkeypatch.setattr(run.supabase, "publish_guda_special_setup", lambda *a, **k: None)

    run.advance_guda_special_setups(NOW, guda_special_settings=None)

    # One 15m read + one 1h (HTF) read, each shared across both setups.
    assert calls.count(("BTCUSDT", "15m")) == 1
    assert calls.count(("BTCUSDT", "1h")) == 1


def test_advance_guda_special_setups_retires_an_older_version_setup_without_a_signal(monkeypatch):
    old = {**_open_setup(state="AWAITING_CONFIRMATION"), "strategy_version": "guda-special-1.0.0"}
    monkeypatch.setattr(run.supabase, "get_open_guda_special_setups", lambda: [old])
    candle_reads, advance_calls = [], []
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda *a, **k: candle_reads.append(a) or [])
    monkeypatch.setattr(run.setups, "advance_setup", lambda *a, **k: advance_calls.append(1))

    setup_calls, transition_calls, signal_calls = [], [], []
    monkeypatch.setattr(run.supabase, "publish_guda_special_setup", lambda *a, **k: setup_calls.append((a, k)))
    monkeypatch.setattr(run.supabase, "publish_guda_special_setup_transition", lambda *a, **k: transition_calls.append(a))
    monkeypatch.setattr(run.supabase, "publish_guda_special_signal", lambda *a, **k: signal_calls.append(1))

    run.advance_guda_special_setups(NOW, guda_special_settings=None)

    assert advance_calls == [] and candle_reads == []
    assert setup_calls[0][0][3] == "guda-special-1.0.0"  # keeps its own version label
    assert setup_calls[0][0][9] == "EXPIRED"
    assert setup_calls[0][1]["invalidation_reason"] == f"superseded by {config.GUDA_SPECIAL_STRATEGY_VERSION}"
    assert transition_calls == [(old["id"], "AWAITING_CONFIRMATION", "EXPIRED", None)]
    assert signal_calls == []


def test_advance_guda_special_setups_passes_an_event_blackout_for_gold_only(monkeypatch):
    monkeypatch.setattr(
        run.supabase, "get_open_guda_special_setups",
        lambda: [_open_setup(symbol="XAUUSD"), _open_setup(symbol="BTCUSDT")],
    )
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda *a, **k: [{"open_time": HOUR, "close": 96.0}])
    monkeypatch.setattr(run.supabase, "publish_guda_special_setup", lambda *a, **k: None)
    seen = {}
    monkeypatch.setattr(
        run.setups, "advance_setup",
        lambda setup, candles, htf_candles, timeframe_seconds, settings=None, event_blackout=None: (
            seen.__setitem__(setup["symbol"], event_blackout) or {"setup": setup, "signal": None}
        ),
    )
    cpi = {"title": "CPI m/m", "country": "USD", "impact": "High", "event_time": NOW + 10 * 60}

    run.advance_guda_special_setups(NOW, guda_special_settings=None, events=[cpi])

    assert seen["XAUUSD"] == cpi
    assert seen["BTCUSDT"] is None


def test_advance_guda_special_setups_is_a_no_op_with_no_open_setups(monkeypatch):
    monkeypatch.setattr(run.supabase, "get_open_guda_special_setups", lambda: [])
    calls = []
    monkeypatch.setattr(run.supabase, "get_recent_candles", lambda *a, **k: calls.append(1))

    run.advance_guda_special_setups(NOW, guda_special_settings=None)

    assert calls == []


# --- Trade outcome tracking (src/trade_sim.py via run.py) ---------------------


class _FakeOutcomes:
    """An in-memory stand-in for the trade_outcomes table and the mirrored candles."""

    def __init__(self, monkeypatch, candles=()):
        self.rows = {}
        self.candles = list(candles)
        monkeypatch.setattr(run.supabase, "publish_trade_outcome", self.publish)
        monkeypatch.setattr(run.supabase, "get_open_trade_outcomes", self.open)
        monkeypatch.setattr(
            run.supabase,
            "get_candles_after",
            lambda symbol, timeframe, after: [c for c in self.candles if c["open_time"] > after],
        )

    def publish(self, source, symbol, timeframe, strategy_version, trade):
        key = (source, symbol, timeframe, strategy_version, trade["signal_time"])
        self.rows[key] = {**trade, "source": source, "symbol": symbol, "timeframe": timeframe,
                          "strategy_version": strategy_version}

    def open(self, source=None, symbol=None, timeframe=None):
        return [
            dict(r) for r in self.rows.values()
            if r["status"] == "OPEN"
            and (source is None or r["source"] == source)
            and (symbol is None or r["symbol"] == symbol)
            and (timeframe is None or r["timeframe"] == timeframe)
        ]


def _c(t, o, h, low, c):
    return {"open_time": t, "open": o, "high": h, "low": low, "close": c, "volume": 1.0}


LEVELS = {"entry": 100.0, "stop": 98.0, "target": 104.0}


def test_a_new_call_starts_a_tracked_trade_with_costs(monkeypatch):
    store = _FakeOutcomes(monkeypatch)
    assert run.open_trade_outcome("confluence", "BTCUSDT", "1h", "3.1.0", NOW, "BUY", LEVELS, 0.7) is True
    (trade,) = store.rows.values()
    assert trade["status"] == "OPEN"
    assert trade["confidence"] == 0.7
    assert trade["cost_pct"] == config.TRADE_COST_PCT["BTCUSDT"]


def test_a_second_call_while_a_trade_is_open_is_not_tracked(monkeypatch):
    store = _FakeOutcomes(monkeypatch, candles=[_c(NOW + HOUR, 100, 101, 99, 100)])
    run.open_trade_outcome("confluence", "BTCUSDT", "1h", "3.1.0", NOW, "BUY", LEVELS)
    assert run.open_trade_outcome("confluence", "BTCUSDT", "1h", "3.1.0", NOW + HOUR, "BUY", LEVELS) is False
    assert len(store.rows) == 1


def test_a_call_on_the_candle_that_closed_the_open_trade_is_tracked(monkeypatch):
    store = _FakeOutcomes(monkeypatch, candles=[_c(NOW + HOUR, 100, 100.5, 97.5, 99)])
    run.open_trade_outcome("confluence", "BTCUSDT", "1h", "3.1.0", NOW, "BUY", LEVELS)
    new_levels = {"entry": 99.0, "stop": 97.0, "target": 103.0}
    assert run.open_trade_outcome("confluence", "BTCUSDT", "1h", "3.1.0", NOW + HOUR, "BUY", new_levels) is True
    statuses = sorted(r["status"] for r in store.rows.values())
    assert statuses == ["OPEN", "STOP"]


def test_other_strategies_and_timeframes_do_not_block_each_other(monkeypatch):
    store = _FakeOutcomes(monkeypatch)
    run.open_trade_outcome("confluence", "BTCUSDT", "1h", "3.1.0", NOW, "BUY", LEVELS)
    assert run.open_trade_outcome("confluence", "BTCUSDT", "4h", "3.1.0", NOW, "BUY", LEVELS) is True
    assert run.open_trade_outcome("guda_special", "BTCUSDT", "1h", "g-1.1.0", NOW, "BUY", LEVELS) is True
    assert len(store.rows) == 3


def test_levels_that_cannot_be_scored_are_not_tracked(monkeypatch):
    store = _FakeOutcomes(monkeypatch)
    assert run.open_trade_outcome("confluence", "BTCUSDT", "1h", "3.1.0", NOW, "BUY", {"entry": 100.0}) is False
    assert store.rows == {}


def test_open_trades_are_walked_through_every_candle_since_the_last_check(monkeypatch):
    # The middle candle's wick hits the stop even though the newest candle closes above the entry.
    store = _FakeOutcomes(monkeypatch, candles=[
        _c(NOW + HOUR, 100, 101, 99, 100.5),
        _c(NOW + 2 * HOUR, 100.5, 101, 97.5, 100.8),
        _c(NOW + 3 * HOUR, 100.8, 102, 100, 101.5),
    ])
    run.open_trade_outcome("confluence", "BTCUSDT", "1h", "3.1.0", NOW, "BUY", LEVELS)
    run.advance_trade_outcomes()
    (trade,) = store.rows.values()
    assert trade["status"] == "STOP"
    assert trade["exit_time"] == NOW + 2 * HOUR
    assert trade["r_net"] < -1.0


def test_a_run_with_no_new_candles_leaves_the_trade_untouched(monkeypatch):
    store = _FakeOutcomes(monkeypatch)
    run.open_trade_outcome("confluence", "BTCUSDT", "1h", "3.1.0", NOW, "BUY", LEVELS)
    writes = []
    monkeypatch.setattr(run.supabase, "publish_trade_outcome", lambda *a: writes.append(a))
    run.advance_trade_outcomes()
    assert writes == []
    assert len(store.rows) == 1


def test_a_published_buy_starts_a_tracked_trade(temp_db, monkeypatch):
    _serve(monkeypatch, _feed(61, NOW))
    monkeypatch.setattr(run.engine, "evaluate", lambda candles, **kwargs: _buy_result())
    monkeypatch.setattr(run.supabase, "publish_signal", lambda *a, **k: True)
    opened = []
    monkeypatch.setattr(run, "open_trade_outcome", lambda *a, **k: opened.append(a))

    run.process(INSTRUMENT, "1h", NOW)

    assert len(opened) == 1
    source, symbol, timeframe, version, signal_time, verdict, levels, confidence = opened[0]
    assert (source, symbol, timeframe, verdict) == ("confluence", "BTCUSDT", "1h", "BUY")
    assert levels == _buy_result()["levels"]
