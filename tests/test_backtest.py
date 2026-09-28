from src import backtest, config
from src.signals import confluence, engine

HOUR = 3600


def _bar(t, o, h, low, c):
    return {"open_time": t, "open": o, "high": h, "low": low, "close": c, "volume": 1.0}


def _flat(n, start=0, step=HOUR, price=100.0):
    return [_bar(start + i * step, price, price + 0.5, price - 0.5, price) for i in range(n)]


BUY = {"verdict": "BUY", "entry": 100.0, "stop": 98.0, "target": 104.0, "confidence": 0.7}


# --- trades_from_signals ---------------------------------------------------------


def test_a_signal_opens_a_trade_that_later_candles_resolve():
    candles = _flat(3) + [_bar(3 * HOUR, 100, 104.5, 99.5, 104)]
    trades, skipped = backtest.trades_from_signals(candles, {HOUR: BUY}, cost_pct=0.0, max_bars=50)
    assert skipped == 0
    assert len(trades) == 1
    assert trades[0]["status"] == "TARGET"
    assert trades[0]["signal_time"] == HOUR
    assert trades[0]["confidence"] == 0.7


def test_a_signal_while_a_trade_is_open_is_skipped_not_counted_twice():
    candles = _flat(6)
    signals = {HOUR: BUY, 2 * HOUR: BUY, 3 * HOUR: {**BUY, "verdict": "SELL", "stop": 102.0, "target": 96.0}}
    trades, skipped = backtest.trades_from_signals(candles, signals, cost_pct=0.0, max_bars=50)
    assert skipped == 2
    assert len(trades) == 1
    assert trades[0]["status"] == "OPEN"


def test_a_new_trade_can_open_on_the_candle_that_closes_the_old_one():
    # The trade from t=1h is stopped out by the candle at t=2h, which also carries a new signal.
    candles = _flat(2) + [_bar(2 * HOUR, 100, 100.5, 97.5, 99)] + _flat(1, start=3 * HOUR)
    signals = {HOUR: BUY, 2 * HOUR: {**BUY, "entry": 99.0, "stop": 97.0, "target": 103.0}}
    trades, skipped = backtest.trades_from_signals(candles, signals, cost_pct=0.0, max_bars=50)
    assert skipped == 0
    assert [t["status"] for t in trades] == ["STOP", "OPEN"]


def test_the_candle_that_opens_a_trade_does_not_also_resolve_it():
    # The signal candle itself reaches the target, but the trade is entered at its close.
    candles = [_bar(0, 100, 105, 99, 100)] + _flat(1, start=HOUR)
    trades, _ = backtest.trades_from_signals(candles, {0: BUY}, cost_pct=0.0, max_bars=50)
    assert trades[0]["status"] == "OPEN"


# --- confluence_signals ------------------------------------------------------------


def test_the_higher_timeframe_bias_only_sees_anchor_candles_already_closed(monkeypatch):
    seen = []

    def spy(anchor_candles, *args, **kwargs):
        seen.append(anchor_candles[-1]["open_time"] if anchor_candles else None)
        return None

    monkeypatch.setattr(confluence, "higher_timeframe_bias", spy)
    candles = _flat(config.MIN_CANDLES_FOR_SIGNAL + 5)  # 1h
    anchor = _flat(10, step=86_400)  # 1d
    backtest.confluence_signals(candles, anchor, "1h", "1d", settings={}, start_time=0)

    for candle, last_anchor in zip(candles[config.MIN_CANDLES_FOR_SIGNAL - 1:], seen):
        if last_anchor is not None:
            assert last_anchor + 86_400 <= candle["open_time"] + HOUR


def test_no_signal_is_taken_before_the_start_time(monkeypatch):
    monkeypatch.setattr(
        engine,
        "evaluate",
        lambda window, **kwargs: {
            "verdict": "BUY",
            "confidence": None,
            "levels": {"entry": window[-1]["close"], "stop": 90.0, "target": 120.0},
        },
    )
    candles = _flat(100)
    start = 80 * HOUR
    signals, verdicts = backtest.confluence_signals(candles, [], "1h", None, settings={}, start_time=start)
    assert min(signals) == start
    assert verdicts["BUY"] == 20


# --- reporting ---------------------------------------------------------------------------


def test_the_report_has_one_row_per_timeframe():
    rows = [
        {
            "timeframe": "1h", "start": 0, "end": 86_400, "signal_count": 3, "skipped": 1,
            "stats": {
                "trades": 2, "win_rate": 0.5, "avg_r_net": 0.4, "avg_r_gross": 0.6, "avg_cost_r": 0.2,
                "profit_factor": 1.8, "total_r_net": 0.8, "max_drawdown_r": 1.0, "worst_losing_streak": 1,
                "target_rate": 0.5, "stop_rate": 0.5, "timeout_rate": 0.0,
            },
        }
    ]
    report = backtest.markdown_report("BTCUSDT", "confluence", rows, 0.24, "Settings: database defaults.")
    assert "| 1h | 1970-01-01 → 1970-01-02 | 3 | 2 | 1 | 50% | +0.40 | +0.60 | 0.20R | 1.80 |" in report


def test_variants_parse_to_a_name_and_typed_settings():
    assert backtest.parse_variant("wide: min_stop_atr=1, target_mode=atr, rsi_chase_limit=75") == (
        "wide", {"min_stop_atr": 1, "target_mode": "atr", "rsi_chase_limit": 75}
    )
    assert backtest.parse_variant(" base: ") == ("base", {})


def test_halves_split_trades_by_when_they_were_signalled():
    def closed(signal_time, r):
        return {"status": "TARGET" if r > 0 else "STOP", "signal_time": signal_time, "exit_time": signal_time + 1,
                "r_net": r, "r_gross": r, "r_cost": 0.0, "bars": 1}

    older, newer = backtest.halves([closed(10, 2.0), closed(20, -1.0), closed(80, 1.0)], start=0, end=100)
    assert older == 0.5
    assert newer == 1.0


def test_a_limit_signal_opens_a_pending_trade_that_can_go_unfilled():
    candles = _flat(8)
    limit = {**BUY, "entry": 99.0, "stop": 97.0, "target": 103.0, "entry_type": "limit"}
    trades, _ = backtest.trades_from_signals(candles, {0: limit}, cost_pct=0.0, max_bars=50, fill_window=3)
    assert [t["status"] for t in trades] == ["CANCELLED"]


# --- Stage 3 ------------------------------------------------------------------------


def test_a_variant_can_change_or_drop_a_timeframes_anchor():
    assert backtest.anchor_for("1d", None, {"anchor_1d": "1w"}) == "1w"
    assert backtest.anchor_for("4h", "1d", {"anchor_4h": "none"}) is None
    assert backtest.anchor_for("4h", "1d", {"anchor_1d": "1w"}) == "1d"
    _, extra = backtest.parse_variant("weekly: anchor_1d=1w, min_stop_atr=1.5")
    assert extra == {"anchor_1d": "1w", "min_stop_atr": 1.5}


def test_confidence_bands_group_closed_trades_by_their_calls_score():
    def closed(confidence, status, r):
        return {"confidence": confidence, "status": status, "r_net": r, "r_gross": r, "r_cost": 0.0,
                "exit_time": 1, "bars": 1}

    trades = [
        closed(0.66, "TARGET", 3.0), closed(0.68, "STOP", -1.0),
        closed(0.82, "TARGET", 3.0), closed(0.9, "TARGET", 3.0), closed(0.85, "STOP", -1.0),
        {**closed(0.7, "OPEN", None), "exit_time": None},
        closed(None, "TARGET", 3.0),
    ]
    bands = backtest.confidence_bands(trades)
    assert [(b["low"], b["high"], b["trades"]) for b in bands] == [(65, 69, 2), (80, 100, 3)]
    assert bands[0]["target_rate"] == 0.5
    assert bands[1]["avg_r_net"] == __import__("pytest").approx(5 / 3)


def test_bands_report_lists_each_band():
    rows = [{"timeframe": "1h", "bands": [{"low": 70, "high": 74, "trades": 12, "target_rate": 0.25,
                                           "win_rate": 0.3, "avg_r_net": 0.1}]}]
    report = backtest.bands_report([(None, rows)])
    assert "| 1h | — | 70–74 | 12 | 25% | 30% | +0.10 |" in report


# --- Twelve Data fetching -------------------------------------------------------------


class _Resp:
    def __init__(self, body):
        self.body = body

    def json(self):
        return self.body


def _twelvedata(monkeypatch, bodies):
    calls, sleeps = [], []
    queue = list(bodies)
    monkeypatch.setenv("TWELVEDATA_API_KEY", "test")
    monkeypatch.setattr(backtest.requests, "get", lambda url, params, timeout: calls.append(params) or _Resp(queue.pop(0)))
    monkeypatch.setattr(backtest.time, "sleep", sleeps.append)
    monkeypatch.setattr(backtest, "_last_twelvedata_request", 0.0)
    return calls, sleeps


def _values(*days):
    return {"values": [{"datetime": d, "open": "1", "high": "2", "low": "0.5", "close": "1.5"} for d in days]}


def test_a_twelvedata_rate_limit_is_waited_out_not_read_as_no_candles(monkeypatch):
    limited = {"status": "error", "code": 429, "message": "You have run out of API credits for the current minute."}
    calls, sleeps = _twelvedata(monkeypatch, [limited, _values("2026-09-01", "2026-09-02")])
    candles = backtest.fetch_twelvedata("XAU/USD", "1d", 0)
    assert len(calls) == 2
    assert 60 in sleeps
    assert [c["open_time"] for c in candles] == [1788220800, 1788307200]


def test_other_twelvedata_errors_are_raised(monkeypatch):
    _twelvedata(monkeypatch, [{"status": "error", "code": 401, "message": "Invalid API key"}])
    with __import__("pytest").raises(RuntimeError, match="Invalid API key"):
        backtest.fetch_twelvedata("XAU/USD", "1d", 0)


def test_twelvedata_requests_are_spaced_across_timeframes(monkeypatch):
    calls, sleeps = _twelvedata(monkeypatch, [_values("2026-09-01"), _values("2026-09-01")])
    backtest.fetch_twelvedata("XAU/USD", "1d", 0)
    backtest.fetch_twelvedata("XAU/USD", "4h", 0)
    assert len(calls) == 2
    assert sleeps and 0 < sleeps[0] <= backtest.TWELVEDATA_PAUSE_SECONDS


def test_the_replay_passes_the_days_funding_at_each_close(monkeypatch):
    seen = []

    def fake_evaluate(window, higher_timeframe_bias=None, settings=None, funding=None):
        seen.append(funding)
        return {"verdict": "HOLD", "levels": None, "confidence": None}

    monkeypatch.setattr(engine, "evaluate", fake_evaluate)
    candles = _flat(config.MIN_CANDLES_FOR_SIGNAL + 2)
    closes = []
    backtest.confluence_signals(candles, [], "1h", None, {}, 0, funding=lambda t: closes.append(t) or 0.05)
    assert seen == [0.05] * 3
    # Asked at each candle's close, not its open.
    assert closes[0] == candles[config.MIN_CANDLES_FOR_SIGNAL - 1]["open_time"] + HOUR
