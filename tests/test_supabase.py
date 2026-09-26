import pytest

from src.storage import supabase


class _Response:
    def raise_for_status(self):
        pass


def _configured(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co/")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")


def _capture(monkeypatch):
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return _Response()

    monkeypatch.setattr(supabase.requests, "post", fake_post)
    return captured


def test_unconfigured_publish_is_a_no_op(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    assert supabase.is_configured() is False
    assert supabase.publish_suppression("BTCUSDT", "1h", 0, "NO_DATA") is False


def test_mirrored_signal_cannot_overwrite_an_existing_call(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    supabase.publish_signal(
        "BTCUSDT",
        "1h",
        generated_at=1_700_000_000,
        candle_time=1_699_996_400,
        price=50000.0,
        verdict="BUY",
        score=2,
        reasoning="RSI(14) at 42.3 — neutral (30-70)",
        evidence_count=3,
        strategy_version="1.0.0",
    )

    assert captured["url"] == "https://project.supabase.co/rest/v1/signals"
    assert captured["params"]["on_conflict"] == "symbol,timeframe,candle_time,strategy_version"
    assert "resolution=ignore-duplicates" in captured["headers"]["Prefer"]


def test_published_signal_includes_confluence_bias(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    supabase.publish_signal(
        "BTCUSDT",
        "5m",
        generated_at=1_700_000_000,
        candle_time=1_699_996_400,
        price=50000.0,
        verdict="BUY",
        score=2,
        reasoning="trend and structure agree",
        evidence_count=2,
        strategy_version="3.0.0",
        confluence_bias="up",
    )

    assert captured["json"][0]["confluence_bias"] == "up"


def test_published_signal_includes_entry_zone_and_regime_fields(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    supabase.publish_signal(
        "BTCUSDT",
        "5m",
        generated_at=1_700_000_000,
        candle_time=1_699_996_400,
        price=50000.0,
        verdict="BUY",
        score=2,
        reasoning="trend and structure agree",
        evidence_count=2,
        strategy_version="3.1.0",
        regime="TRENDING",
        market_phase="PULLBACK",
        invalidation_level=49000.0,
        entry_zone_low=49500.0,
        entry_zone_high=49800.0,
    )

    row = captured["json"][0]
    assert row["regime"] == "TRENDING"
    assert row["market_phase"] == "PULLBACK"
    assert row["invalidation_level"] == 49000.0
    assert row["entry_zone_low"] == 49500.0
    assert row["entry_zone_high"] == 49800.0


def test_epoch_timestamps_are_sent_as_utc(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    supabase.publish_suppression("XAUUSD", "1h", 1_700_000_000, "STALE_DATA", "weekend")

    row = captured["json"][0]
    assert row["observed_at"] == "2023-11-14T22:13:20+00:00"
    assert row["reason"] == "STALE_DATA"


@pytest.mark.parametrize(
    "configured",
    [
        "https://project.supabase.co",
        "https://project.supabase.co/",
        "https://project.supabase.co/rest/v1",
        "https://project.supabase.co/rest/v1/",
        "  https://project.supabase.co  ",
    ],
)
def test_project_url_is_accepted_however_it_was_pasted(monkeypatch, configured):
    monkeypatch.setenv("SUPABASE_URL", configured)
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    captured = _capture(monkeypatch)

    supabase.publish_suppression("BTCUSDT", "1h", 0, "NO_DATA", "")

    assert captured["url"] == "https://project.supabase.co/rest/v1/signal_suppressions"


def _candle(open_time, complete=True, close=100.0):
    return {
        "open_time": open_time,
        "open": close - 1,
        "high": close + 1,
        "low": close - 2,
        "close": close,
        "volume": 5.0,
        "complete": complete,
    }


def _mirror_state(monkeypatch, newest):
    """Stub the 'what does Supabase already have' lookup."""
    monkeypatch.setattr(supabase, "newest_mirrored_candle", lambda symbol, timeframe: newest)


def test_the_forming_candle_is_never_mirrored(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)
    _mirror_state(monkeypatch, None)

    sent = supabase.publish_candles("BTCUSDT", "1h", [_candle(0), _candle(3600, complete=False)])

    assert sent == 1
    assert len(captured["json"]) == 1
    assert captured["json"][0]["open_time"].startswith("1970-01-01T00:00:00")


def test_only_candles_newer_than_the_mirror_are_sent(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)
    _mirror_state(monkeypatch, 3600)

    sent = supabase.publish_candles("BTCUSDT", "1h", [_candle(0), _candle(3600), _candle(7200)])

    assert sent == 1
    assert len(captured["json"]) == 1


def test_an_empty_mirror_is_backfilled(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)
    _mirror_state(monkeypatch, None)

    sent = supabase.publish_candles("BTCUSDT", "1h", [_candle(0), _candle(3600), _candle(7200)])

    assert sent == 3
    assert captured["params"]["on_conflict"] == "symbol,timeframe,open_time"


def test_nothing_is_sent_when_the_mirror_is_current(monkeypatch):
    _configured(monkeypatch)
    posted = []
    monkeypatch.setattr(supabase.requests, "post", lambda *a, **k: posted.append(1))
    _mirror_state(monkeypatch, 7200)

    assert supabase.publish_candles("BTCUSDT", "1h", [_candle(0), _candle(7200)]) == 0
    assert posted == []


def test_candles_are_not_mirrored_when_unconfigured(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    assert supabase.publish_candles("BTCUSDT", "1h", [_candle(0)]) == 0


def test_suppressions_are_appended_not_deduplicated(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    supabase.publish_suppression("XAUUSD", "1h", 1_700_000_000, "NO_DATA", "")

    assert "on_conflict" not in captured["params"]


def _event(title="CPI m/m", country="USD", event_time=1_700_000_000, impact="High", forecast=None, previous=None):
    return {
        "title": title,
        "country": country,
        "event_time": event_time,
        "impact": impact,
        "forecast": forecast,
        "previous": previous,
    }


def test_events_are_mirrored_with_a_merge_on_conflict(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    sent = supabase.publish_events([_event()])

    assert sent == 1
    assert captured["url"] == "https://project.supabase.co/rest/v1/economic_events"
    assert captured["params"]["on_conflict"] == "title,country,event_time"
    assert "resolution=merge-duplicates" in captured["headers"]["Prefer"]
    row = captured["json"][0]
    assert row["title"] == "CPI m/m"
    assert row["event_time"] == "2023-11-14T22:13:20+00:00"


def test_a_missing_actual_defaults_to_none_rather_than_a_missing_key(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    supabase.publish_events([_event()])

    assert captured["json"][0]["actual"] is None


def test_events_are_not_mirrored_when_unconfigured(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    assert supabase.publish_events([_event()]) == 0


def test_an_empty_events_list_is_a_no_op(monkeypatch):
    _configured(monkeypatch)
    posted = []
    monkeypatch.setattr(supabase.requests, "post", lambda *a, **k: posted.append(1))

    assert supabase.publish_events([]) == 0
    assert posted == []


class _JsonResponse(_Response):
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


def test_commentary_is_mirrored_with_the_signal_identity_on_conflict(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    ok = supabase.publish_commentary(
        "BTCUSDT", "1h", 1_700_000_000, "1.0.0", "The trend and momentum readings agree here.", "gemini-2.5-flash"
    )

    assert ok is True
    assert captured["url"] == "https://project.supabase.co/rest/v1/signal_commentary"
    assert captured["params"]["on_conflict"] == "symbol,timeframe,candle_time,strategy_version"
    row = captured["json"][0]
    assert row["commentary"] == "The trend and momentum readings agree here."
    assert row["model"] == "gemini-2.5-flash"
    assert row["candle_time"] == "2023-11-14T22:13:20+00:00"


def test_ai_settings_are_not_read_when_unconfigured(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    assert supabase.get_active_ai_settings() is None


def test_ai_settings_return_the_first_active_row(monkeypatch):
    _configured(monkeypatch)
    monkeypatch.setattr(
        supabase.requests,
        "get",
        lambda *a, **k: _JsonResponse([{"provider": "gemini", "config": {"api_key": "k", "model": "gemini-2.5-flash"}}]),
    )

    settings = supabase.get_active_ai_settings()

    assert settings == {"provider": "gemini", "config": {"api_key": "k", "model": "gemini-2.5-flash"}}


def test_ai_settings_are_none_when_nothing_is_active(monkeypatch):
    _configured(monkeypatch)
    monkeypatch.setattr(supabase.requests, "get", lambda *a, **k: _JsonResponse([]))

    assert supabase.get_active_ai_settings() is None


def test_ai_settings_failure_is_swallowed_not_raised(monkeypatch):
    _configured(monkeypatch)

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(supabase.requests, "get", boom)

    assert supabase.get_active_ai_settings() is None


def test_engine_settings_are_not_read_when_unconfigured(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    assert supabase.get_engine_settings() is None


def test_engine_settings_return_the_singleton_row(monkeypatch):
    _configured(monkeypatch)
    row = {
        "atr_stop_multiplier": 0.75,
        "reward_to_risk": 1.5,
        "min_reward_to_risk": 1.5,
        "min_confidence_threshold": 65,
        "require_higher_timeframe_confluence": True,
    }
    monkeypatch.setattr(supabase.requests, "get", lambda *a, **k: _JsonResponse([row]))

    assert supabase.get_engine_settings() == row


def test_engine_settings_are_none_when_the_table_is_empty(monkeypatch):
    _configured(monkeypatch)
    monkeypatch.setattr(supabase.requests, "get", lambda *a, **k: _JsonResponse([]))

    assert supabase.get_engine_settings() is None


def test_engine_settings_failure_is_swallowed_not_raised(monkeypatch):
    _configured(monkeypatch)

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(supabase.requests, "get", boom)

    assert supabase.get_engine_settings() is None


def test_recent_candles_are_empty_when_unconfigured(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    assert supabase.get_recent_candles("BTCUSDT", "1h") == []


def test_recent_candles_are_reversed_to_oldest_first(monkeypatch):
    _configured(monkeypatch)
    rows = [
        {"open_time": "2023-11-14T23:00:00+00:00", "open": 2, "high": 3, "low": 1, "close": 2.5, "volume": 1},
        {"open_time": "2023-11-14T22:00:00+00:00", "open": 1, "high": 2, "low": 0.5, "close": 1.5, "volume": 1},
    ]
    monkeypatch.setattr(supabase.requests, "get", lambda *a, **k: _JsonResponse(rows))

    candles = supabase.get_recent_candles("BTCUSDT", "1h", limit=10)

    assert [c["close"] for c in candles] == [1.5, 2.5]
    assert candles[0]["open_time"] < candles[1]["open_time"]


def test_recent_candles_failure_is_swallowed_not_raised(monkeypatch):
    _configured(monkeypatch)

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(supabase.requests, "get", boom)

    assert supabase.get_recent_candles("BTCUSDT", "1h") == []


def test_lifecycle_is_published_with_a_merge_on_conflict(monkeypatch):
    # Unlike every other _insert() caller (signals, commentary — all
    # ignore-duplicates), a lifecycle row must genuinely overwrite the
    # existing row for this identity, since its whole point is to change.
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    ok = supabase.publish_lifecycle(
        "BTCUSDT", "1h", 1_699_996_400, "3.1.0", "READY", 1_700_000_000, 1_700_000_100, 50250.0, 1_699_996_400
    )

    assert ok is True
    assert captured["url"] == "https://project.supabase.co/rest/v1/signal_lifecycle"
    assert captured["params"]["on_conflict"] == "symbol,timeframe,candle_time,strategy_version"
    assert "resolution=merge-duplicates" in captured["headers"]["Prefer"]
    row = captured["json"][0]
    assert row["state"] == "READY"
    assert row["last_price"] == 50250.0


def test_lifecycle_transition_is_published_without_a_merge_on_conflict(monkeypatch):
    # A transition, once logged, is never meant to be overwritten — the
    # default ignore-duplicates behavior is correct here, unlike
    # publish_lifecycle above.
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    ok = supabase.publish_lifecycle_transition("BTCUSDT", "1h", 1_699_996_400, "3.1.0", "WATCH", "READY", 50250.0)

    assert ok is True
    assert captured["url"] == "https://project.supabase.co/rest/v1/signal_lifecycle_transitions"
    assert "resolution=merge-duplicates" not in captured["headers"]["Prefer"]
    row = captured["json"][0]
    assert row["from_state"] == "WATCH"
    assert row["to_state"] == "READY"


def test_open_lifecycle_rows_are_empty_when_unconfigured(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    assert supabase.get_open_lifecycle_rows() == []


def test_open_lifecycle_rows_filter_to_non_terminal_states(monkeypatch):
    _configured(monkeypatch)
    captured = {}

    def fake_get(url, **kwargs):
        captured.update(kwargs)
        return _JsonResponse(
            [
                {
                    "symbol": "BTCUSDT",
                    "timeframe": "1h",
                    "candle_time": "2023-11-14T22:13:20+00:00",
                    "strategy_version": "3.1.0",
                    "state": "WATCH",
                    "entered_at": "2023-11-14T22:13:20+00:00",
                }
            ]
        )

    monkeypatch.setattr(supabase.requests, "get", fake_get)

    rows = supabase.get_open_lifecycle_rows()

    assert captured["params"]["state"] == "in.(WAIT,WATCH,READY)"
    assert len(rows) == 1
    assert rows[0]["state"] == "WATCH"
    assert rows[0]["candle_time"] == 1_700_000_000.0


def test_open_lifecycle_rows_failure_is_swallowed_not_raised(monkeypatch):
    _configured(monkeypatch)

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(supabase.requests, "get", boom)

    assert supabase.get_open_lifecycle_rows() == []


def test_signal_by_identity_is_none_when_unconfigured(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    assert supabase.get_signal_by_identity("BTCUSDT", "1h", 1_699_996_400, "3.1.0") is None


def test_signal_by_identity_queries_the_full_tuple(monkeypatch):
    _configured(monkeypatch)
    captured = {}

    def fake_get(url, **kwargs):
        captured.update(kwargs)
        return _JsonResponse(
            [
                {
                    "verdict": "BUY",
                    "entry": 50000.0,
                    "stop": 49500.0,
                    "candle_time": "2023-11-14T22:13:20+00:00",
                    "invalidation_level": 49400.0,
                    "entry_zone_low": 49900.0,
                    "entry_zone_high": 50100.0,
                }
            ]
        )

    monkeypatch.setattr(supabase.requests, "get", fake_get)

    signal = supabase.get_signal_by_identity("BTCUSDT", "1h", 1_699_996_400, "3.1.0")

    assert captured["params"]["candle_time"] == "eq.2023-11-14T21:13:20+00:00"
    assert captured["params"]["strategy_version"] == "eq.3.1.0"
    assert signal["verdict"] == "BUY"
    assert signal["candle_time"] == 1_700_000_000.0


def test_signal_by_identity_is_none_when_no_row_matches(monkeypatch):
    _configured(monkeypatch)
    monkeypatch.setattr(supabase.requests, "get", lambda *a, **k: _JsonResponse([]))

    assert supabase.get_signal_by_identity("BTCUSDT", "1h", 1_699_996_400, "3.1.0") is None


def test_signal_by_identity_failure_is_swallowed_not_raised(monkeypatch):
    _configured(monkeypatch)

    def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr(supabase.requests, "get", boom)

    assert supabase.get_signal_by_identity("BTCUSDT", "1h", 1_699_996_400, "3.1.0") is None
