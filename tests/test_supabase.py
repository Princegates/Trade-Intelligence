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


def test_epoch_timestamps_are_sent_as_utc(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    supabase.publish_suppression("XAUUSD", "1h", 1_700_000_000, "STALE_DATA", "weekend")

    row = captured["json"][0]
    assert row["observed_at"] == "2023-11-14T22:13:20+00:00"
    assert row["reason"] == "STALE_DATA"


def test_suppressions_are_appended_not_deduplicated(monkeypatch):
    _configured(monkeypatch)
    captured = _capture(monkeypatch)

    supabase.publish_suppression("XAUUSD", "1h", 1_700_000_000, "NO_DATA", "")

    assert "on_conflict" not in captured["params"]
