"""SQLite storage. The .db file itself is committed to the repo by the cron
job, so history is just `git log` on data/trade_intelligence.db."""

import json
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
    patterns TEXT NOT NULL DEFAULT '',
    entry REAL,
    stop REAL,
    target REAL,
    buy_above REAL,
    sell_below REAL,
    confluence_bias TEXT,
    regime TEXT,
    market_phase TEXT,
    invalidation_level REAL,
    entry_zone_low REAL,
    entry_zone_high REAL,
    volatility_regime TEXT,
    confidence_breakdown TEXT,
    fib_50 REAL,
    fib_61_8 REAL,
    fib_72 REAL,
    fib_78_6 REAL,
    fib_direction INTEGER,
    range_position_pct REAL,
    range_zone TEXT,
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


# CREATE TABLE IF NOT EXISTS silently does nothing to a table that already
# exists, so a column added to SCHEMA never reaches the committed database —
# every run then fails on "no column named ...". Columns added after the
# first release are listed here and applied on open.
ADDED_COLUMNS = {
    "candles": {
        "is_complete": "INTEGER NOT NULL DEFAULT 0",
    },
    "signals": {
        "confidence": "REAL",
        "evidence_count": "INTEGER NOT NULL DEFAULT 0",
        "strategy_version": "TEXT NOT NULL DEFAULT ''",
        "patterns": "TEXT NOT NULL DEFAULT ''",
        "entry": "REAL",
        "stop": "REAL",
        "target": "REAL",
        "buy_above": "REAL",
        "sell_below": "REAL",
        "confluence_bias": "TEXT",
        "regime": "TEXT",
        "market_phase": "TEXT",
        "invalidation_level": "REAL",
        "entry_zone_low": "REAL",
        "entry_zone_high": "REAL",
        "volatility_regime": "TEXT",
        "confidence_breakdown": "TEXT",
        "fib_50": "REAL",
        "fib_61_8": "REAL",
        "fib_72": "REAL",
        "fib_78_6": "REAL",
        "fib_direction": "INTEGER",
        "range_position_pct": "REAL",
        "range_zone": "TEXT",
    },
}


def _add_missing_columns(conn):
    for table, columns in ADDED_COLUMNS.items():
        present = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        for name, definition in columns.items():
            if name not in present:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def init_db():
    with connect() as conn:
        conn.executescript(SCHEMA)
        _add_missing_columns(conn)


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
    """Closed candles only, oldest first, as open/high/low/close dicts.

    The forming candle is excluded so indicators never see a value that is
    still moving (SE-002). Full OHLC rather than closes alone, because
    candlestick patterns and ATR are read from the body and wicks."""
    with connect() as conn:
        rows = conn.execute(
            """SELECT open_time, open, high, low, close, volume FROM candles
               WHERE symbol=? AND timeframe=? AND is_complete=1
               ORDER BY open_time DESC LIMIT ?""",
            (symbol, timeframe, limit),
        ).fetchall()
    rows.reverse()
    return [
        {"open_time": r[0], "open": r[1], "high": r[2], "low": r[3], "close": r[4], "volume": r[5]}
        for r in rows
    ]


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
    patterns="",
    levels=None,
    confluence_bias=None,
    regime=None,
    market_phase=None,
    invalidation_level=None,
    entry_zone_low=None,
    entry_zone_high=None,
    volatility_regime=None,
    confidence_breakdown=None,
    fibonacci=None,
    price_range=None,
):
    """Insert-only. A published signal is never rewritten (FR-SIG-004), so a
    re-run over the same closed candle is ignored rather than overwriting the
    original call. Returns True when a new signal was stored.

    `confidence_breakdown` is a dict (src/signals/engine.py's structured
    confidence breakdown) or None — SQLite has no native jsonb, so it's
    stored as a JSON string; nothing in this codebase reads it back out of
    SQLite (it's a disposable per-run scratch copy, not the durable store —
    see Supabase's publish_signal for the jsonb column real consumers
    read). `fibonacci`/`price_range` are the dicts engine.evaluate()
    returns under those keys, unpacked into their own flat columns here to
    match Supabase's shape."""
    levels = levels or {}
    fibonacci = fibonacci or {}
    price_range = price_range or {}
    fib_levels = fibonacci.get("levels") or {}
    with connect() as conn:
        cur = conn.execute(
            """INSERT OR IGNORE INTO signals
               (symbol, timeframe, generated_at, candle_time, price, verdict, score,
                confidence, evidence_count, strategy_version, reasoning, patterns,
                entry, stop, target, buy_above, sell_below, confluence_bias,
                regime, market_phase, invalidation_level, entry_zone_low, entry_zone_high,
                volatility_regime, confidence_breakdown, fib_50, fib_61_8, fib_72, fib_78_6,
                fib_direction, range_position_pct, range_zone)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
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
                patterns,
                levels.get("entry"),
                levels.get("stop"),
                levels.get("target"),
                levels.get("buy_above"),
                levels.get("sell_below"),
                confluence_bias,
                regime,
                market_phase,
                invalidation_level,
                entry_zone_low,
                entry_zone_high,
                volatility_regime,
                json.dumps(confidence_breakdown) if confidence_breakdown is not None else None,
                fib_levels.get("fib_50"),
                fib_levels.get("fib_61_8"),
                fib_levels.get("fib_72"),
                fib_levels.get("fib_78_6"),
                fibonacci.get("direction"),
                price_range.get("position_pct"),
                price_range.get("zone"),
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
