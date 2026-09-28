"""Replays a strategy over historical candles and scores every trade it
would have taken with src/trade_sim.py — the same rules, costs and
one-position-at-a-time limit the live outcome tracker uses, so a backtest
and live results can be compared like for like.

Usage:
    python -m src.backtest --symbol BTCUSDT                          # confluence engine, every timeframe
    python -m src.backtest --symbol BTCUSDT --strategy guda_special
    python -m src.backtest --symbol BTCUSDT --timeframes 1h,4h --days 365
    python -m src.backtest --symbol BTCUSDT --setting min_reward_to_risk=2
    python -m src.backtest --symbol BTCUSDT --variant "base:" --variant "wide: min_stop_atr=1"
    python -m src.backtest --symbol BTCUSDT --publish --summary-file "$GITHUB_STEP_SUMMARY"

Faithful to src/run.py where it matters: the same engine and settings (the
live admin settings when Supabase is configured, otherwise the database
defaults), the same CANDLE_FETCH_LIMIT window, and a higher-timeframe bias
built only from anchor candles that had fully closed by then — no
look-ahead. Not reproduced: the economic-calendar blackout (there's no
historical calendar feed), so results around big releases are slightly
optimistic.

Gold history comes from Twelve Data, whose free plan the live engine
already uses almost in full each day — a long gold backtest can leave the
live gold feed short of requests until the next day. Run it sparingly.
"""

import argparse
import csv
import os
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests

from . import backtest_guda, config, trade_sim
from .ingest import twelvedata
from .signals import confluence, engine
from .storage import db, supabase

TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"]

# How far back each timeframe is replayed by default: roughly 17,000
# candles for the short ones, enough trades to mean something without
# fetching years of 5-minute data.
DEFAULT_DAYS = {"5m": 60, "15m": 180, "1h": 730, "4h": 1460, "1d": 2190}

# web/supabase/migrations 0014/0017 defaults — what the live engine runs
# with until an admin changes them.
ENGINE_DEFAULTS = {
    "atr_stop_multiplier": 0.75,
    "reward_to_risk": 1.5,
    "min_reward_to_risk": 1.5,
    "min_confidence_threshold": 65,
    "require_higher_timeframe_confluence": True,
    "structure_buffer_atr": 0.25,
    "entry_zone_width_atr": 0.5,
    "max_entry_zone_distance_atr": 1.5,
}

# Twelve Data's free plan allows 8 requests a minute.
TWELVEDATA_PAUSE_SECONDS = 8


# --- replay (pure) --------------------------------------------------------------


def confluence_signals(candles, anchor_candles, timeframe, anchor_timeframe, settings, start_time):
    """{candle open_time: signal} for every BUY/SELL the confluence engine
    would have published from `start_time` on, plus a count of every
    verdict. `candles` include warm-up history before `start_time`."""
    tf_seconds = config.TIMEFRAME_SECONDS[timeframe]
    anchor_seconds = config.TIMEFRAME_SECONDS[anchor_timeframe] if anchor_timeframe else 0
    window_size = config.CANDLE_FETCH_LIMIT

    signals, verdicts = {}, Counter()
    anchor_i = 0
    for i, candle in enumerate(candles):
        if candle["open_time"] < start_time or i + 1 < config.MIN_CANDLES_FOR_SIGNAL:
            continue
        window = candles[max(0, i + 1 - window_size): i + 1]

        bias = None
        if anchor_timeframe:
            closed_by = candle["open_time"] + tf_seconds
            while anchor_i < len(anchor_candles) and anchor_candles[anchor_i]["open_time"] + anchor_seconds <= closed_by:
                anchor_i += 1
            bias = confluence.higher_timeframe_bias(anchor_candles[max(0, anchor_i - window_size):anchor_i])

        result = engine.evaluate(window, higher_timeframe_bias=bias, settings=settings)
        verdicts[result["verdict"]] += 1
        levels = result["levels"]
        if result["verdict"] in ("BUY", "SELL") and levels:
            signals[candle["open_time"]] = {
                "verdict": result["verdict"],
                "entry": levels["entry"],
                "stop": levels["stop"],
                "target": levels["target"],
                "entry_type": levels.get("entry_type", "market"),
                "confidence": result["confidence"],
            }
    return signals, verdicts


def guda_special_signals(candles, htf_candles, settings):
    """Same shape as confluence_signals, from GUDA SPECIAL's own replay
    (src/backtest_guda.py), which already mirrors run.py's detect-then-
    advance order on 15m with a 1H filter."""
    result = backtest_guda.simulate(candles, htf_candles, settings)
    signals, verdicts = {}, Counter()
    for s in result["signals"]:
        verdicts[s["verdict"]] += 1
        if s["verdict"] in ("BUY", "SELL"):
            signals.setdefault(s["candle_time"], {**s, "confidence": None})
    return signals, verdicts


def trades_from_signals(candles, signals, cost_pct, max_bars, fill_window=None, be_at_r=None):
    """Walks the candles once: each candle first moves any open trade on,
    then a signal on that candle opens a trade if none is open. A signal
    while a trade is still open is skipped — one position per strategy,
    market and timeframe, the same limit the live tracker applies, so one
    move isn't counted several times. A limit entry waits as pending
    (which also counts as the open position) for up to `fill_window`
    candles. Returns (trades, skipped)."""
    trades, skipped, current = [], 0, None
    for candle in candles:
        if current is not None:
            current = trade_sim.advance(current, [candle], max_bars)
            if current["status"] not in (trade_sim.OPEN, trade_sim.PENDING):
                trades.append(current)
                current = None

        signal = signals.get(candle["open_time"])
        if signal is None:
            continue
        if current is not None:
            skipped += 1
            continue
        direction = 1 if signal["verdict"] == "BUY" else -1
        opened = trade_sim.open_trade(
            direction, signal["entry"], signal["stop"], signal["target"], candle["open_time"], cost_pct,
            pending=signal.get("entry_type") == "limit", fill_window=fill_window, be_at_r=be_at_r,
        )
        if opened is not None:
            current = {**opened, "confidence": signal.get("confidence")}

    if current is not None:
        trades.append(current)
    return trades, skipped


# --- data ------------------------------------------------------------------------


def _closed(rows, interval):
    now = int(datetime.now(timezone.utc).timestamp())
    duration = config.TIMEFRAME_SECONDS[interval]
    return [r for r in rows if r["open_time"] + duration <= now]


def fetch_binance(symbol, interval, start_time):
    """Pages forward from `start_time`, 1000 candles a request (Binance's cap)."""
    by_time = {}
    cursor = start_time * 1000
    while True:
        resp = requests.get(
            config.BINANCE_BASE_URL,
            params={"symbol": symbol, "interval": interval, "limit": 1000, "startTime": cursor},
            timeout=20,
        )
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            break
        for r in rows:
            by_time[int(r[0]) // 1000] = {
                "open_time": int(r[0]) // 1000, "open": float(r[1]), "high": float(r[2]),
                "low": float(r[3]), "close": float(r[4]), "volume": float(r[5]),
            }
        if len(rows) < 1000:
            break
        cursor = int(rows[-1][0]) + 1
    return _closed([by_time[t] for t in sorted(by_time)], interval)


def fetch_twelvedata(provider_symbol, interval, start_time):
    """Pages backwards from now, 5000 candles a request (Twelve Data's cap),
    pausing between requests for the free plan's per-minute limit."""
    api_key = os.environ.get("TWELVEDATA_API_KEY")
    if not api_key:
        raise SystemExit("TWELVEDATA_API_KEY is not set")
    by_time, end_date, first = {}, None, True
    while True:
        if not first:
            time.sleep(TWELVEDATA_PAUSE_SECONDS)
        first = False
        params = {
            "symbol": provider_symbol, "interval": twelvedata.INTERVAL_MAP[interval], "outputsize": 5000,
            "timezone": "UTC", "apikey": api_key, "format": "JSON",
        }
        if end_date:
            params["end_date"] = end_date
        data = requests.get(twelvedata.BASE_URL, params=params, timeout=20).json()
        values = data.get("values")
        if not values:
            break
        oldest = None
        for row in values:
            raw = row["datetime"]
            fmt = "%Y-%m-%d %H:%M:%S" if " " in raw else "%Y-%m-%d"
            t = int(datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc).timestamp())
            by_time[t] = {
                "open_time": t, "open": float(row["open"]), "high": float(row["high"]),
                "low": float(row["low"]), "close": float(row["close"]), "volume": float(row.get("volume") or 0),
            }
            oldest = t if oldest is None else min(oldest, t)
        if oldest <= start_time or len(values) < 5000:
            break
        end_date = datetime.fromtimestamp(oldest - 1, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    return _closed([by_time[t] for t in sorted(by_time) if t >= start_time], interval)


def load_candles(instrument, interval, start_time, source):
    if source == "local":
        db.init_db()
        return [c for c in db.get_recent_candles(instrument["symbol"], interval, limit=1_000_000)
                if c["open_time"] >= start_time]
    if instrument["provider"] == "binance":
        return fetch_binance(instrument["provider_symbol"], interval, start_time)
    return fetch_twelvedata(instrument["provider_symbol"], interval, start_time)


# --- reporting ---------------------------------------------------------------------


def _fmt_r(v):
    return "—" if v is None else f"{v:+.2f}"


def _fmt_pct(v):
    return "—" if v is None else f"{v:.0%}"


def _fmt_num(v, places=2):
    return "—" if v is None else f"{v:.{places}f}"


def _day(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


def markdown_report(symbol, strategy, rows, cost_pct, settings_note):
    lines = [
        f"### {strategy} backtest — {symbol}",
        "",
        f"Costs: {cost_pct:.2f}% round trip per trade. One position at a time per timeframe. "
        "Stops checked against every candle's high and low; a candle touching stop and target counts as the stop. "
        f"{settings_note}",
        "",
        "| Timeframe | Period | Signals | Trades | Skipped (in a trade) | Win rate | Avg R after costs | Avg R before costs "
        "| Cost per trade | Profit factor | Total R | Max drawdown | Worst losing run | Target / stop / timeout |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        s = r["stats"]
        split = (
            f"{_fmt_pct(s['target_rate'])} / {_fmt_pct(s['stop_rate'])} / {_fmt_pct(s['timeout_rate'])}"
            if s["trades"] else "—"
        )
        lines.append(
            f"| {r['timeframe']} | {_day(r['start'])} → {_day(r['end'])} | {r['signal_count']} | {s['trades']} "
            f"| {r['skipped']} | {_fmt_pct(s['win_rate'])} | {_fmt_r(s['avg_r_net'])} | {_fmt_r(s['avg_r_gross'])} "
            f"| {_fmt_num(s['avg_cost_r'])}R | {_fmt_num(s['profit_factor'])} | {_fmt_r(s['total_r_net'])} "
            f"| {_fmt_num(s['max_drawdown_r'], 1)}R | {s['worst_losing_streak']} | {split} |"
        )
    return "\n".join(lines) + "\n"


def halves(trades, start, end):
    """Average R after costs in the older and the newer half of the period —
    an idea that only works in one half probably isn't an edge."""
    mid = start + (end - start) / 2
    older = trade_sim.summarize([t for t in trades if t["signal_time"] < mid])
    newer = trade_sim.summarize([t for t in trades if t["signal_time"] >= mid])
    return older["avg_r_net"], newer["avg_r_net"]


def comparison_report(symbol, strategy, results, cost_pct):
    """One row per timeframe per variant, grouped by timeframe."""
    lines = [
        f"### {strategy} variants — {symbol}",
        "",
        f"Costs: {cost_pct:.2f}% round trip unless a variant sets cost_pct. Same trade rules as the live tracker. "
        "Halves: average R after costs in the older and newer half of the period.",
        "",
        "| Timeframe | Variant | Trades | Unfilled | Win rate | Avg before costs | Avg after costs | Profit factor "
        "| Total R | Max drawdown | Older half | Newer half |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for tf in TIMEFRAMES:
        for name, rows in results:
            for r in rows:
                if r["timeframe"] != tf:
                    continue
                s = r["stats"]
                lines.append(
                    f"| {tf} | {name} | {s['trades']} | {s['cancelled']} | {_fmt_pct(s['win_rate'])} "
                    f"| {_fmt_r(s['avg_r_gross'])} | {_fmt_r(s['avg_r_net'])} | {_fmt_num(s['profit_factor'])} "
                    f"| {_fmt_r(s['total_r_net'])} | {_fmt_num(s['max_drawdown_r'], 1)}R "
                    f"| {_fmt_r(r['halves'][0])} | {_fmt_r(r['halves'][1])} |"
                )
    return "\n".join(lines) + "\n"


def parse_variant(text):
    """"name: key=value, key=value" -> (name, {key: value})."""
    name, _, rest = text.partition(":")
    pairs = [p.strip() for p in rest.split(",") if p.strip()]
    return name.strip() or "variant", dict(backtest_guda._parse_setting(p) for p in pairs)


def write_trades_csv(path, symbol, strategy, timeframe, trades):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["strategy", "symbol", "timeframe", "signal_time", "direction", "entry", "stop", "target",
                    "status", "exit_time", "exit_price", "bars", "r_gross", "r_cost", "r_net", "mfe_r", "mae_r",
                    "confidence"])
        for t in trades:
            w.writerow([
                strategy, symbol, timeframe,
                datetime.fromtimestamp(t["signal_time"], tz=timezone.utc).isoformat(),
                "BUY" if t["direction"] == 1 else "SELL", t["entry"], t["stop"], t["target"], t["status"],
                datetime.fromtimestamp(t["exit_time"], tz=timezone.utc).isoformat() if t["exit_time"] else "",
                t["exit_price"] if t["exit_price"] is not None else "", t["bars"],
                "" if t["r_gross"] is None else round(t["r_gross"], 4), round(t["r_cost"], 4),
                "" if t["r_net"] is None else round(t["r_net"], 4), round(t["mfe_r"], 4), round(t["mae_r"], 4),
                "" if t.get("confidence") is None else t["confidence"],
            ])


# --- CLI ---------------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(prog="backtest", description=__doc__.split("\n\n")[0])
    parser.add_argument("--symbol", default="BTCUSDT", choices=[i["symbol"] for i in config.INSTRUMENTS])
    parser.add_argument("--strategy", default="confluence", choices=("confluence", "guda_special"))
    parser.add_argument("--timeframes", default=",".join(TIMEFRAMES),
                        help="comma-separated; GUDA SPECIAL only ever runs on 15m")
    parser.add_argument("--days", type=int, help="replay this many days for every timeframe (default varies)")
    parser.add_argument("--source", choices=("auto", "local"), default="auto")
    parser.add_argument("--setting", action="append", default=[], metavar="KEY=VALUE",
                        help="override one engine setting, e.g. min_reward_to_risk=2")
    parser.add_argument("--variant", action="append", default=[], metavar='"NAME: KEY=VALUE, ..."',
                        help="compare named setting variations side by side (candles are fetched once)")
    parser.add_argument("--cost-pct", type=float, help="round-trip cost in percent (default from config)")
    parser.add_argument("--out", default="backtest-results", help="directory for the per-trade CSV files")
    parser.add_argument("--summary-file", help="also append the markdown report here (e.g. $GITHUB_STEP_SUMMARY)")
    parser.add_argument("--publish", action="store_true", help="save each timeframe's result to Supabase")
    args = parser.parse_args()

    instrument = next(i for i in config.INSTRUMENTS if i["symbol"] == args.symbol)
    cost_pct = args.cost_pct if args.cost_pct is not None else config.TRADE_COST_PCT.get(
        args.symbol, config.DEFAULT_TRADE_COST_PCT)
    overrides = dict(backtest_guda._parse_setting(s) for s in args.setting)

    if args.strategy == "confluence":
        live = supabase.get_engine_settings() if supabase.is_configured() else None
        base = {k: live[k] for k in ENGINE_DEFAULTS if live and live.get(k) is not None} if live else {}
        # Same layering as src/run.py: database defaults, Stage 2 defaults,
        # the admin's saved values, then this run's overrides.
        settings = {**ENGINE_DEFAULTS, **config.ENGINE_SETTING_DEFAULTS, **base, **overrides}
        timeframes = [tf for tf in args.timeframes.split(",") if tf in TIMEFRAMES]
    else:
        live = supabase.get_guda_special_settings() if supabase.is_configured() else None
        settings = {**(live or {}), **overrides}
        timeframes = [backtest_guda.TF]
    settings_note = (
        f"Settings: {'live admin settings' if live else 'database defaults'}"
        + (f", overridden: {overrides}." if overrides else ".")
    )

    now = int(datetime.now(timezone.utc).timestamp())
    max_bars = config.TRADE_MAX_BARS[args.strategy]

    # Each timeframe is fetched once, far enough back for its own replay
    # plus warm-up, and for any timeframe that uses it as an anchor.
    needs = {}

    def need(tf, days, warmup_bars):
        start = now - days * 86_400 - warmup_bars * config.TIMEFRAME_SECONDS[tf]
        needs[tf] = min(needs.get(tf, start), start)

    plan = []
    for tf in timeframes:
        days = args.days or DEFAULT_DAYS[tf]
        anchor = backtest_guda.HTF if args.strategy == "guda_special" else confluence.ANCHOR_TIMEFRAME.get(tf)
        need(tf, days, config.CANDLE_FETCH_LIMIT)
        if anchor:
            need(anchor, days, config.CANDLE_FETCH_LIMIT)
        plan.append((tf, anchor, now - days * 86_400))

    cache = {}
    for tf in sorted(needs, key=TIMEFRAMES.index):
        print(f"fetching {args.symbol} {tf} since {_day(needs[tf])}...", flush=True)
        cache[tf] = load_candles(instrument, tf, needs[tf], args.source)
        print(f"  {len(cache[tf])} candles", flush=True)

    variants = [parse_variant(v) for v in args.variant] or [(None, {})]
    results = []
    for name, extra in variants:
        # A variant may set its own round-trip cost ("cost_pct=0.06") to see
        # how results depend on what a broker charges.
        extra = dict(extra)
        vcost = float(extra.pop("cost_pct", cost_pct))
        # The engine's cost check needs this market's costs; harmless otherwise.
        vsettings = {**settings, **extra, "round_trip_cost_pct": vcost}
        fill_window = vsettings.get("fill_window", 5)
        rows = []
        for tf, anchor, start_time in plan:
            candles = cache[tf]
            if len(candles) < config.MIN_CANDLES_FOR_SIGNAL:
                print(f"{tf}: only {len(candles)} candles — skipped")
                continue
            started = time.time()
            if args.strategy == "confluence":
                signals, verdicts = confluence_signals(candles, cache.get(anchor, []), tf, anchor, vsettings, start_time)
            else:
                warmup = config.CANDLE_FETCH_LIMIT * config.TIMEFRAME_SECONDS[tf]
                in_range = [c for c in candles if c["open_time"] >= start_time - warmup]
                signals, verdicts = guda_special_signals(in_range, cache.get(anchor, []), vsettings)
            replayed = [c for c in candles if c["open_time"] >= start_time]
            trades, skipped = trades_from_signals(
                replayed, signals, vcost, max_bars, fill_window, vsettings.get("be_at_r")
            )
            stats = trade_sim.summarize(trades)
            period_start = replayed[0]["open_time"] if replayed else start_time
            period_end = replayed[-1]["open_time"] if replayed else now
            rows.append({
                "timeframe": tf, "start": period_start, "end": period_end, "candles": len(replayed),
                "signal_count": len(signals), "verdicts": dict(verdicts), "skipped": skipped, "stats": stats,
                "halves": halves(trades, period_start, period_end),
            })
            suffix = f"-{name}" if name else ""
            write_trades_csv(Path(args.out) / f"{args.strategy}-{args.symbol}-{tf}{suffix}.csv",
                             args.symbol, args.strategy, tf, trades)
            print(f"{name + ' ' if name else ''}{tf}: {len(replayed)} candles, {len(signals)} signals, "
                  f"{stats['trades']} trades, avg {_fmt_r(stats['avg_r_net'])}R after costs "
                  f"({time.time() - started:.0f}s)", flush=True)
        results.append((name, rows))

    if args.variant:
        report = comparison_report(args.symbol, args.strategy, results, cost_pct)
    else:
        report = markdown_report(args.symbol, args.strategy, results[0][1], cost_pct, settings_note)
    rows = results[0][1]
    print()
    print(report)
    if args.summary_file:
        with open(args.summary_file, "a") as fh:
            fh.write(report + "\n")

    if args.publish and args.variant:
        print("[info] not publishing: variant comparisons are experiments, not the live settings")
    if args.publish and not args.variant:
        version = config.STRATEGY_VERSION if args.strategy == "confluence" else config.GUDA_SPECIAL_STRATEGY_VERSION
        for r in rows:
            # The report above is already out; a failed save (e.g. migration
            # 0028 not applied yet) is reported, not fatal.
            try:
                ok = supabase.publish_backtest_run({
                    "strategy": args.strategy, "strategy_version": version, "symbol": args.symbol,
                    "timeframe": r["timeframe"], "period_start": r["start"], "period_end": r["end"],
                    "candles": r["candles"], "signals": r["signal_count"], "skipped": r["skipped"],
                    "cost_pct": cost_pct, "settings": {**settings, "overrides": overrides}, **r["stats"],
                })
                print(f"published {r['timeframe']}: {'ok' if ok else 'Supabase not configured'}")
            except Exception as exc:
                print(f"[warn] {r['timeframe']} not published ({exc})")


if __name__ == "__main__":
    main()
