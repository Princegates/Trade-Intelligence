"""SQLite storage. The .db file itself is committed to the repo by the cron
job, so history is just `git log` on data/trade_intelligence.db."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "trade_intelligence.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS candles (
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    open_time INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL,
    PRIMARY KEY (symbol, timeframe, open_time)
);

CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    generated_at INTEGER NOT NULL,
    candle_time INTEGER NOT NULL,
    price REAL NOT NULL,
    verdict TEXT NOT NULL,
    score INTEGER NOT NULL,
    reasoning TEXT NOT NULL,
    UNIQUE(symbol, timeframe, candle_time)
);
"""


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with connect() as conn:
        conn.executescript(SCHEMA)


def upsert_candles(symbol, timeframe, candles):
    with connect() as conn:
        conn.executemany(
            """INSERT INTO candles (symbol, timeframe, open_time, open, high, low, close, volume)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(symbol, timeframe, open_time) DO UPDATE SET
                 open=excluded.open, high=excluded.high, low=excluded.low,
                 close=excluded.close, volume=excluded.volume""",
            [
                (symbol, timeframe, c["open_time"], c["open"], c["high"], c["low"], c["close"], c["volume"])
                for c in candles
            ],
        )


def get_recent_candles(symbol, timeframe, limit=200):
    """Returns (open_time, close) tuples, oldest first."""
    with connect() as conn:
        rows = conn.execute(
            """SELECT open_time, close FROM candles WHERE symbol=? AND timeframe=?
               ORDER BY open_time DESC LIMIT ?""",
            (symbol, timeframe, limit),
        ).fetchall()
    rows.reverse()
    return rows


def record_signal(symbol, timeframe, generated_at, candle_time, price, verdict, score, reasoning):
    with connect() as conn:
        conn.execute(
            """INSERT INTO signals (symbol, timeframe, generated_at, candle_time, price, verdict, score, reasoning)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(symbol, timeframe, candle_time) DO UPDATE SET
                 generated_at=excluded.generated_at, price=excluded.price,
                 verdict=excluded.verdict, score=excluded.score, reasoning=excluded.reasoning""",
            (symbol, timeframe, generated_at, candle_time, price, verdict, score, reasoning),
        )


def latest_signals():
    with connect() as conn:
        rows = conn.execute(
            """SELECT symbol, timeframe, generated_at, price, verdict, score, reasoning
               FROM signals s
               WHERE generated_at = (
                   SELECT MAX(generated_at) FROM signals s2
                   WHERE s2.symbol = s.symbol AND s2.timeframe = s.timeframe
               )
               ORDER BY symbol, timeframe"""
        ).fetchall()
    return rows


def signal_history(symbol, timeframe, limit=20):
    with connect() as conn:
        rows = conn.execute(
            """SELECT generated_at, price, verdict, score, reasoning
               FROM signals WHERE symbol=? AND timeframe=?
               ORDER BY generated_at DESC LIMIT ?""",
            (symbol, timeframe, limit),
        ).fetchall()
    return rows
