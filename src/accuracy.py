"""Scores past BUY/SELL signals against what price actually did afterward —
the same self-accountability the football project applies to its own picks.
HOLD calls are excluded since they don't make a directional claim.

Usage: python -m src.accuracy --symbol BTCUSDT --timeframe 1h --horizon 5
"""

import argparse

from .storage import db


def evaluate_accuracy(symbol, timeframe, horizon=5):
    with db.connect() as conn:
        signals = conn.execute(
            """SELECT candle_time, price, verdict FROM signals
               WHERE symbol=? AND timeframe=? AND verdict != 'HOLD'
               ORDER BY candle_time""",
            (symbol, timeframe),
        ).fetchall()
        candles = conn.execute(
            "SELECT open_time, close FROM candles WHERE symbol=? AND timeframe=? ORDER BY open_time",
            (symbol, timeframe),
        ).fetchall()

    times = [c[0] for c in candles]
    closes = [c[1] for c in candles]
    time_index = {t: i for i, t in enumerate(times)}

    total = 0
    correct = 0
    details = []
    for candle_time, price, verdict in signals:
        idx = time_index.get(candle_time)
        if idx is None:
            continue
        target_idx = idx + horizon
        if target_idx >= len(closes):
            continue  # not resolved yet
        future_price = closes[target_idx]
        moved_up = future_price > price
        hit = (verdict == "BUY" and moved_up) or (verdict == "SELL" and not moved_up)
        total += 1
        correct += int(hit)
        details.append((candle_time, verdict, price, future_price, hit))

    return {
        "total": total,
        "correct": correct,
        "hit_rate": (correct / total) if total else None,
        "details": details,
    }


def main():
    parser = argparse.ArgumentParser(description="Check how past BUY/SELL signals played out")
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--timeframe", required=True)
    parser.add_argument("--horizon", type=int, default=5, help="candles ahead to check the outcome")
    args = parser.parse_args()

    result = evaluate_accuracy(args.symbol, args.timeframe, args.horizon)
    if result["total"] == 0:
        print("Not enough resolved signals yet to score accuracy.")
        return

    print(
        f"{args.symbol}/{args.timeframe} — {result['correct']}/{result['total']} correct "
        f"({result['hit_rate']:.1%}) over a {args.horizon}-candle horizon"
    )
    for candle_time, verdict, price, future_price, hit in result["details"][-10:]:
        mark = "correct" if hit else "wrong"
        print(f"  [{mark}] {verdict} @ {price} -> {future_price}")


if __name__ == "__main__":
    main()
