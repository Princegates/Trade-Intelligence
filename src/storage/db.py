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
    is_complete INTEGER NOT NULL DEFAULT 0,
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
    confidence REAL,
    evidence_count INTEGER NOT NULL,
    strategy_version TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    UNIQUE(symbol, timeframe, candle_time, strategy_version)
);

CREATE TABLE IF NOT EXISTS signal_suppressions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    observed_at INTEGER NOT NULL,
    reason TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
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
    """Candles are upserted, not append-only: a candle legitimately changes
    while it is forming, and its final values land once it closes."""
    with connect() as conn:
        conn.executemany(
            """INSERT INTO candles (symbol, timeframe, open_time, open, high, low, close, volume, is_complete)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(symbol, timeframe, open_time) DO UPDATE SET
                 open=excluded.open, high=excluded.high, low=excluded.low,
                 close=excluded.close, volume=excluded.volume,
                 is_complete=excluded.is_complete""",
            [
                (
                    symbol,
                    timeframe,
                    c["open_time"],
                    c["open"],
                    c["high"],
                    c["low"],
                    c["close"],
                    c["volume"],
                    int(c["complete"]),
                )
                for c in candles
            ],
        )


def get_recent_candles(symbol, timeframe, limit=200):
    """Returns (open_time, close) tuples for *closed* candles only, oldest
    first. The forming candle is excluded so indicators never see a value
    that is still moving (SE-002)."""
    with connect() as conn:
        rows = conn.execute(
            """SELECT open_time, close FROM candles
               WHERE symbol=? AND timeframe=? AND is_complete=1
               ORDER BY open_time DESC LIMIT ?""",
            (symbol, timeframe, limit),
        ).fetchall()
    rows.reverse()
    return rows


def newest_complete_candle(symbol, timeframe):
    """open_time of the newest closed candle held locally, or None."""
    with connect() as conn:
        row = conn.execute(
            """SELECT MAX(open_time) FROM candles
               WHERE symbol=? AND timeframe=? AND is_complete=1""",
            (symbol, timeframe),
        ).fetchone()
    return row[0]


def record_signal(
    symbol,
    timeframe,
    generated_at,
    candle_time,
    price,
    verdict,
    score,
    reasoning,
    evidence_count,
    strategy_version,
    confidence=None,
):
    """Insert-only. A published signal is never rewritten (FR-SIG-004), so a
    re-run over the same closed candle is ignored rather than overwriting the
    original call. Returns True when a new signal was stored."""
    with connect() as conn:
        cur = conn.execute(
            """INSERT OR IGNORE INTO signals
               (symbol, timeframe, generated_at, candle_time, price, verdict, score,
                confidence, evidence_count, strategy_version, reasoning)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                symbol,
                timeframe,
                generated_at,
                candle_time,
                price,
                verdict,
                score,
                confidence,
                evidence_count,
                strategy_version,
                reasoning,
            ),
        )
        return cur.rowcount == 1


def record_suppression(symbol, timeframe, observed_at, reason, detail=""):
    """Why a candidate signal was not published (SE-010)."""
    with connect() as conn:
        conn.execute(
            """INSERT INTO signal_suppressions (symbol, timeframe, observed_at, reason, detail)
               VALUES (?, ?, ?, ?, ?)""",
            (symbol, timeframe, observed_at, reason, detail),
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
