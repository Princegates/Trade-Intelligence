"""Replays GUDA SPECIAL over historical candles and scores every trade it
would have published — the only honest way to say whether a rule change
made it more accurate, rather than asserting it.

Usage:
    python -m src.backtest_guda --symbol BTCUSDT --source binance --days 90
    python -m src.backtest_guda --symbol XAUUSD --source twelvedata --days 45
    python -m src.backtest_guda --symbol BTCUSDT --source local
    python -m src.backtest_guda --symbol BTCUSDT --days 90 --setting min_reward_to_risk=2.5

Faithful to src/run.py where it matters: the same detect-then-advance order
each closed 15m candle, the same CANDLE_FETCH_LIMIT window, and only 1H
candles that had fully closed by then — no look-ahead. Two things it can't
reproduce: the economic-calendar blackout (there's no historical feed, so
gold results are slightly optimistic around big releases) and fills (entry
is the confirmation candle's close, as the published signal states).

A trade is resolved by walking forward: stop first -> -1R, target first ->
+reward_to_risk R. A candle that touches both counts as the stop — intrabar
order is unknown, so this assumes the worse one. Unresolved after
--max-hold candles, it's closed at that candle's close for whatever R it's
worth.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone

import requests

from . import config
from .ingest import twelvedata
from .signals import setups
from .storage import db

TF = "15m"
HTF = "1h"
_OPEN_STATES = ("PUBLISHED", "INVALIDATED", "EXPIRED")


def simulate(candles, htf_candles, settings=None, max_hold=96):
    """Returns {"setups": int, "signals": [...], "trades": [...]} for a full
    replay of `candles` (15m, oldest first). Pure — no I/O."""
    settings = settings or {}
    tf_seconds = config.TIMEFRAME_SECONDS[TF]
    htf_seconds = config.TIMEFRAME_SECONDS[HTF]
    window_size = config.CANDLE_FETCH_LIMIT

    created, open_setups, signals, trades = set(), [], [], []
    htf_i = 0
    for n in range(config.MIN_CANDLES_FOR_SIGNAL, len(candles) + 1):
        window = candles[max(0, n - window_size):n]
        now_close = window[-1]["open_time"] + tf_seconds
        while htf_i < len(htf_candles) and htf_candles[htf_i]["open_time"] + htf_seconds <= now_close:
            htf_i += 1
        htf_window = htf_candles[max(0, htf_i - window_size):htf_i]

        new = setups.detect_new_setups(window, settings)
        if new and new["bos_candle_time"] not in created:
            created.add(new["bos_candle_time"])
            open_setups.append({
                **new, "state": "BOS_DETECTED", "impulse_start_price": None, "impulse_end_price": None,
                "impulse_atr_multiple": None, "fib_50": None, "fib_61_8": None, "fib_72": None, "fib_78_6": None,
            })

        still_open = []
        for setup in open_setups:
            result = setups.advance_setup(setup, window, htf_window, tf_seconds, settings)
            signal = result["signal"]
            if signal is not None:
                signal = {**signal, "candle_time": window[-1]["open_time"]}
                signals.append(signal)
                if signal["verdict"] in ("BUY", "SELL"):
                    trades.append(resolve_trade(signal, candles[n:n + max_hold]))
            if result["setup"]["state"] not in _OPEN_STATES:
                still_open.append(result["setup"])
        open_setups = still_open

    return {"setups": len(created), "signals": signals, "trades": trades}


def resolve_trade(signal, future):
    """R-multiple outcome of one published signal over the candles that
    closed after it. `future` is oldest first."""
    entry, stop, target = signal["entry"], signal["stop"], signal["target"]
    direction = 1 if signal["verdict"] == "BUY" else -1
    risk = abs(entry - stop)
    base = {"candle_time": signal["candle_time"], "verdict": signal["verdict"], "entry": entry,
            "stop": stop, "target": target}

    for i, c in enumerate(future, start=1):
        hit_stop = c["low"] <= stop if direction == 1 else c["high"] >= stop
        hit_target = c["high"] >= target if direction == 1 else c["low"] <= target
        if hit_stop:
            return {**base, "outcome": "STOP", "r": -1.0, "bars": i}
        if hit_target:
            return {**base, "outcome": "TARGET", "r": abs(target - entry) / risk, "bars": i}

    if not future:
        return {**base, "outcome": "OPEN", "r": 0.0, "bars": 0}
    last = future[-1]["close"]
    return {**base, "outcome": "TIMEOUT", "r": direction * (last - entry) / risk, "bars": len(future)}


def summarize(result):
    trades = [t for t in result["trades"] if t["outcome"] != "OPEN"]
    rs = [t["r"] for t in trades]
    equity, peak, drawdown, streak, worst_streak = 0.0, 0.0, 0.0, 0, 0
    for r in rs:
        equity += r
        peak = max(peak, equity)
        drawdown = max(drawdown, peak - equity)
        streak = streak + 1 if r < 0 else 0
        worst_streak = max(worst_streak, streak)
    wins = sum(1 for r in rs if r > 0)
    return {
        "setups": result["setups"],
        "no_trade": Counter(s["no_trade_reason"] for s in result["signals"] if s["verdict"] == "NO_TRADE"),
        "trades": len(trades),
        "still_open": len(result["trades"]) - len(trades),
        "win_rate": wins / len(rs) if rs else None,
        "expectancy_r": sum(rs) / len(rs) if rs else None,
        "total_r": sum(rs),
        "max_drawdown_r": drawdown,
        "worst_losing_streak": worst_streak,
    }


def _fetch_binance(symbol, interval, days):
    """Pages backwards from now, 1000 candles a request (Binance's cap)."""
    end_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_ms = end_ms - days * 86_400_000
    by_time = {}
    while end_ms > start_ms:
        resp = requests.get(
            config.BINANCE_BASE_URL,
            params={"symbol": symbol, "interval": interval, "limit": 1000, "endTime": end_ms},
            timeout=15,
        )
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            break
        for row in rows:
            by_time[int(row[0]) // 1000] = row
        end_ms = int(rows[0][0]) - 1
    now = int(datetime.now(timezone.utc).timestamp())
    duration = config.TIMEFRAME_SECONDS[interval]
    return [
        {"open_time": t, "open": float(r[1]), "high": float(r[2]), "low": float(r[3]),
         "close": float(r[4]), "volume": float(r[5])}
        for t, r in sorted(by_time.items())
        if t >= start_ms // 1000 and t + duration <= now
    ]


def load(symbol, source, days):
    if source == "binance":
        return _fetch_binance(symbol, TF, days), _fetch_binance(symbol, HTF, days + 11)
    if source == "twelvedata":
        provider_symbol = next(
            (i["provider_symbol"] for i in config.INSTRUMENTS if i["symbol"] == symbol), symbol
        )
        per_day = {TF: 96, HTF: 24}
        fetched = []
        for interval in (TF, HTF):
            rows = twelvedata.fetch_klines(provider_symbol, interval, min(5000, days * per_day[interval]))
            if rows is None:
                raise SystemExit("TWELVEDATA_API_KEY is not set")
            fetched.append([c for c in rows if c["complete"]])
        return fetched[0], fetched[1]
    db.init_db()
    return db.get_recent_candles(symbol, TF, limit=100_000), db.get_recent_candles(symbol, HTF, limit=100_000)


def _parse_setting(text):
    key, _, raw = text.partition("=")
    for cast in (int, float):
        try:
            return key, cast(raw)
        except ValueError:
            pass
    return key, {"true": True, "false": False}.get(raw.lower(), raw)


def main():
    parser = argparse.ArgumentParser(prog="backtest_guda", description=__doc__.split("\n\n")[0])
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--source", choices=("binance", "twelvedata", "local"), default="binance")
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--max-hold", type=int, default=96, help="15m candles before an open trade is closed out")
    parser.add_argument("--setting", action="append", default=[], metavar="KEY=VALUE",
                        help="override a guda_special_settings value, e.g. min_reward_to_risk=2.5")
    parser.add_argument("--trades", action="store_true", help="also print every trade")
    args = parser.parse_args()

    candles, htf = load(args.symbol, args.source, args.days)
    if len(candles) < config.MIN_CANDLES_FOR_SIGNAL:
        raise SystemExit(f"only {len(candles)} {TF} candles available — not enough to replay")

    settings = dict(_parse_setting(s) for s in args.setting)
    result = simulate(candles, htf, settings, args.max_hold)
    stats = summarize(result)

    span_days = (candles[-1]["open_time"] - candles[0]["open_time"]) / 86_400
    print(f"{config.GUDA_SPECIAL_STRATEGY_VERSION} on {args.symbol} {TF}: {len(candles)} candles (~{span_days:.1f} days)")
    if settings:
        print(f"settings overrides: {settings}")
    print(f"setups opened: {stats['setups']}   trades: {stats['trades']}   still open at end: {stats['still_open']}")
    if stats["trades"]:
        print(f"win rate: {stats['win_rate']:.1%}   expectancy: {stats['expectancy_r']:+.2f}R per trade   "
              f"total: {stats['total_r']:+.1f}R")
        print(f"max drawdown: {stats['max_drawdown_r']:.1f}R   worst losing streak: {stats['worst_losing_streak']}")
    for reason, count in stats["no_trade"].most_common():
        print(f"  NO_TRADE x{count}: {reason}")
    if args.trades:
        for t in result["trades"]:
            when = datetime.fromtimestamp(t["candle_time"], tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
            print(f"  {when}  {t['verdict']:4s} entry {t['entry']:.2f} stop {t['stop']:.2f} "
                  f"target {t['target']:.2f} -> {t['outcome']:7s} {t['r']:+.2f}R in {t['bars']} bars")


if __name__ == "__main__":
    main()
