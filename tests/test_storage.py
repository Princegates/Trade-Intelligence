import pytest

from src.storage import db


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test.db")
    db.init_db()


def _signal(**overrides):
    base = {
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "generated_at": 1000,
        "candle_time": 900,
        "price": 50000.0,
        "verdict": "BUY",
        "score": 2,
        "reasoning": "original reasoning",
        "evidence_count": 3,
        "strategy_version": "1.0.0",
    }
    return {**base, **overrides}


def _candle(**overrides):
    base = {
        "open_time": 0,
        "open": 100.0,
        "high": 110.0,
        "low": 90.0,
        "close": 105.0,
        "volume": 5.0,
        "complete": True,
    }
    return {**base, **overrides}


def test_published_signal_is_never_rewritten(temp_db):
    assert db.record_signal(**_signal()) is True

    rewrite = _signal(generated_at=2000, verdict="SELL", score=-2, reasoning="rewritten")
    assert db.record_signal(**rewrite) is False

    history = db.signal_history("BTCUSDT", "1h")
    assert len(history) == 1
    _, _, verdict, _, reasoning = history[0]
    assert verdict == "BUY"
    assert reasoning == "original reasoning"


def test_a_new_strategy_version_publishes_alongside_the_old_call(temp_db):
    assert db.record_signal(**_signal()) is True
    assert db.record_signal(**_signal(strategy_version="2.0.0", verdict="SELL")) is True
    assert len(db.signal_history("BTCUSDT", "1h")) == 2


def test_forming_candle_is_hidden_from_indicator_input(temp_db):
    db.upsert_candles(
        "BTCUSDT",
        "1h",
        [_candle(open_time=0, close=105.0), _candle(open_time=3600, close=108.0, complete=False)],
    )
    rows = db.get_recent_candles("BTCUSDT", "1h")
    assert [(r["open_time"], r["close"]) for r in rows] == [(0, 105.0)]


def test_candle_is_revised_once_it_closes(temp_db):
    db.upsert_candles("BTCUSDT", "1h", [_candle(open_time=3600, close=108.0, complete=False)])
    assert db.get_recent_candles("BTCUSDT", "1h") == []

    db.upsert_candles("BTCUSDT", "1h", [_candle(open_time=3600, close=112.0, complete=True)])
    rows = db.get_recent_candles("BTCUSDT", "1h")
    assert [(r["open_time"], r["close"]) for r in rows] == [(3600, 112.0)]


def test_candles_come_back_oldest_first(temp_db):
    db.upsert_candles(
        "BTCUSDT",
        "1h",
        [_candle(open_time=0, close=100.0), _candle(open_time=3600, close=101.0)],
    )
    rows = db.get_recent_candles("BTCUSDT", "1h")
    assert [(r["open_time"], r["close"]) for r in rows] == [(0, 100.0), (3600, 101.0)]


def test_suppression_records_its_reason(temp_db):
    db.record_suppression("XAUUSD", "1h", 1000, "STALE_DATA", "newest closed candle opened 99999s ago")

    with db.connect() as conn:
        rows = conn.execute("SELECT symbol, reason, detail FROM signal_suppressions").fetchall()

    assert rows == [("XAUUSD", "STALE_DATA", "newest closed candle opened 99999s ago")]
