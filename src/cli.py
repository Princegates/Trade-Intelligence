"""CLI for checking signals without opening a browser. Usage:

    python -m src.cli latest
    python -m src.cli history --symbol BTCUSDT --timeframe 1h
"""

import argparse
from datetime import datetime, timezone

from .storage import db


def fmt_time(ts):
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def cmd_latest(_args):
    db.init_db()
    rows = db.latest_signals()
    if not rows:
        print("No signals recorded yet. Run `python -m src.run` first.")
        return
    for symbol, timeframe, generated_at, price, verdict, score, reasoning in rows:
        print(f"[{symbol} {timeframe}] {verdict} (score {score:+d}) @ {price} — {fmt_time(generated_at)}")
        print(f"  {reasoning}")


def cmd_history(args):
    db.init_db()
    rows = db.signal_history(args.symbol, args.timeframe, limit=args.limit)
    if not rows:
        print(f"No history for {args.symbol}/{args.timeframe}")
        return
    for generated_at, price, verdict, score, reasoning in rows:
        print(f"{fmt_time(generated_at)}  {verdict:5s} score={score:+d}  @ {price}")
        print(f"  {reasoning}")


def main():
    parser = argparse.ArgumentParser(prog="trade-intel", description="Trade Intelligence CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("latest", help="Show the latest signal for every tracked symbol/timeframe").set_defaults(
        func=cmd_latest
    )

    hist = sub.add_parser("history", help="Show signal history for one symbol/timeframe")
    hist.add_argument("--symbol", required=True)
    hist.add_argument("--timeframe", required=True)
    hist.add_argument("--limit", type=int, default=20)
    hist.set_defaults(func=cmd_history)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
