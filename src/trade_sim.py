"""How a published trade would actually have played out, in R (multiples of
the risk between entry and stop), after costs.

One set of rules, shared by the live outcome tracker (src/run.py) and the
backtest (src/backtest.py), so live results and backtests measure the same
thing and can be compared like for like:

- Entry is the signal candle's close — the price every signal publishes.
- Each later closed candle is checked by its high and low, not only its
  close: a wick through the stop is a stop, exactly as a real stop order
  would be triggered.
- A candle that touches both the stop and the target counts as the stop.
  Which came first inside the candle is unknown, so assume the worse.
- A candle that opens beyond the stop (a gap) fills at its open, not at the
  stop — the stop couldn't have been filled at a price that never traded.
- A target fills at the target.
- A trade still open after `max_bars` candles is closed at that candle's
  close, for whatever it's worth then.
- Costs: a round trip of `cost_pct` percent of the entry price, converted to
  R and subtracted from every trade (src/config.py TRADE_COST_PCT).

Pure — no I/O. Trades are plain dicts so they can be stored as-is.
"""

OPEN = "OPEN"
CLOSED = ("TARGET", "STOP", "TIMEOUT")


def open_trade(direction, entry, stop, target, signal_time, cost_pct):
    """A new trade, or None when the levels can't describe one (missing,
    zero risk, or a stop/target on the wrong side of the entry)."""
    if None in (entry, stop, target) or direction not in (1, -1):
        return None
    ordered = stop < entry < target if direction == 1 else target < entry < stop
    if not ordered:
        return None
    risk = abs(entry - stop)
    return {
        "direction": direction,
        "entry": entry,
        "stop": stop,
        "target": target,
        "signal_time": signal_time,
        "last_candle_time": signal_time,
        "bars": 0,
        "status": OPEN,
        "mfe_r": 0.0,
        "mae_r": 0.0,
        "exit_price": None,
        "exit_time": None,
        "cost_pct": cost_pct,
        "r_gross": None,
        "r_cost": entry * cost_pct / 100 / risk,
        "r_net": None,
    }


def _close(trade, status, price, time):
    risk = abs(trade["entry"] - trade["stop"])
    r_gross = trade["direction"] * (price - trade["entry"]) / risk
    return {
        **trade,
        "status": status,
        "exit_price": price,
        "exit_time": time,
        "r_gross": r_gross,
        "r_net": r_gross - trade["r_cost"],
    }


def advance(trade, candles, max_bars):
    """The trade after walking `candles` (closed, oldest first). Candles at
    or before the trade's `last_candle_time` are skipped, so passing the
    same recent history again on every run is safe. A closed trade is
    returned unchanged."""
    if trade["status"] != OPEN:
        return trade

    t = dict(trade)
    d, entry, stop, target = t["direction"], t["entry"], t["stop"], t["target"]
    risk = abs(entry - stop)

    for c in candles:
        if c["open_time"] <= t["last_candle_time"]:
            continue
        t["bars"] += 1
        t["last_candle_time"] = c["open_time"]

        favorable = c["high"] - entry if d == 1 else entry - c["low"]
        adverse = entry - c["low"] if d == 1 else c["high"] - entry
        t["mfe_r"] = max(t["mfe_r"], favorable / risk)
        t["mae_r"] = max(t["mae_r"], adverse / risk)

        hit_stop = c["low"] <= stop if d == 1 else c["high"] >= stop
        if hit_stop:
            gapped = c["open"] < stop if d == 1 else c["open"] > stop
            return _close(t, "STOP", c["open"] if gapped else stop, c["open_time"])

        hit_target = c["high"] >= target if d == 1 else c["low"] <= target
        if hit_target:
            return _close(t, "TARGET", target, c["open_time"])

        if t["bars"] >= max_bars:
            return _close(t, "TIMEOUT", c["close"], c["open_time"])

    return t


def summarize(trades):
    """Headline numbers for a set of trades, closed ones only (open trades
    are counted separately). Ordered by exit time for the drawdown and
    losing-streak figures, which depend on sequence."""
    closed = sorted((t for t in trades if t["status"] in CLOSED), key=lambda t: t["exit_time"])
    rs = [t["r_net"] for t in closed]
    n = len(rs)

    equity = peak = drawdown = 0.0
    streak = worst_streak = 0
    for r in rs:
        equity += r
        peak = max(peak, equity)
        drawdown = max(drawdown, peak - equity)
        streak = streak + 1 if r <= 0 else 0
        worst_streak = max(worst_streak, streak)

    gains = sum(r for r in rs if r > 0)
    losses = -sum(r for r in rs if r < 0)

    def share(status):
        return sum(1 for t in closed if t["status"] == status) / n if n else None

    return {
        "trades": n,
        "open": sum(1 for t in trades if t["status"] == OPEN),
        "wins": sum(1 for r in rs if r > 0),
        "win_rate": sum(1 for r in rs if r > 0) / n if n else None,
        "avg_r_net": sum(rs) / n if n else None,
        "avg_r_gross": sum(t["r_gross"] for t in closed) / n if n else None,
        "avg_cost_r": sum(t["r_cost"] for t in closed) / n if n else None,
        "total_r_net": sum(rs),
        # None when there were no losing trades to divide by.
        "profit_factor": gains / losses if losses > 0 else None,
        "max_drawdown_r": drawdown,
        "worst_losing_streak": worst_streak,
        "avg_bars": sum(t["bars"] for t in closed) / n if n else None,
        "target_rate": share("TARGET"),
        "stop_rate": share("STOP"),
        "timeout_rate": share("TIMEOUT"),
    }
