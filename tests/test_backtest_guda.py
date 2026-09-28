from src import backtest_guda as bt
from tests.test_setups_replay import TF, _candle, _textbook_bullish


def _bar(o, h, low, c, t=0):
    return {"open_time": t, "open": o, "high": h, "low": low, "close": c, "volume": 1.0}


BUY = {"verdict": "BUY", "entry": 100.0, "stop": 98.0, "target": 104.0, "candle_time": 0}
SELL = {"verdict": "SELL", "entry": 100.0, "stop": 102.0, "target": 96.0, "candle_time": 0}


def test_a_buy_that_reaches_its_target_is_plus_rr():
    trade = bt.resolve_trade(BUY, [_bar(100, 101, 99, 101), _bar(101, 104.5, 100, 104)])
    assert (trade["outcome"], trade["r"], trade["bars"]) == ("TARGET", 2.0, 2)


def test_a_buy_that_reaches_its_stop_is_minus_one():
    trade = bt.resolve_trade(BUY, [_bar(100, 100.5, 97.5, 98)])
    assert (trade["outcome"], trade["r"]) == ("STOP", -1.0)


def test_a_candle_touching_both_counts_as_the_stop():
    trade = bt.resolve_trade(BUY, [_bar(100, 105, 97, 101)])
    assert trade["outcome"] == "STOP"


def test_a_sell_mirrors():
    assert bt.resolve_trade(SELL, [_bar(100, 100.5, 95.5, 96)])["outcome"] == "TARGET"
    assert bt.resolve_trade(SELL, [_bar(100, 102.5, 99, 102)])["outcome"] == "STOP"


def test_an_unresolved_trade_is_closed_out_at_the_last_close():
    trade = bt.resolve_trade(BUY, [_bar(100, 101, 99.5, 100.5), _bar(100.5, 102, 100, 101.0)])
    assert trade["outcome"] == "TIMEOUT"
    assert trade["r"] == 0.5


def test_no_future_candles_is_still_open():
    assert bt.resolve_trade(BUY, [])["outcome"] == "OPEN"


def _with_history_and_follow_through():
    """The textbook series from test_setups_replay, behind 40 candles of
    older decline (the replay only starts once MIN_CANDLES_FOR_SIGNAL
    candles exist, like run.py) and followed by a rally through the 2R
    target."""
    prefix = []
    prev = 100.0
    for i in range(40):
        close = round(100.0 - (i + 1) * 0.35, 2)
        prefix.append(_candle(i, prev, close))
        prev = close
    body = [{**c, "open_time": c["open_time"] + 40 * TF} for c in _textbook_bullish()]
    body[0] = {**body[0], "open": prev}
    after, last = [], body[-1]["close"]
    for k, close in enumerate([113.5, 114.5, 115.5, 116.5, 117.5, 118.5]):
        after.append(_candle(40 + len(body) + k, last, close))
        last = close
    return prefix + body + after


def test_simulate_scores_the_textbook_trade_as_a_2r_win():
    result = bt.simulate(_with_history_and_follow_through(), [])
    assert result["setups"] == 1
    assert [(t["verdict"], t["outcome"]) for t in result["trades"]] == [("BUY", "TARGET")]
    assert abs(result["trades"][0]["r"] - 2.0) < 1e-9


def test_summarize_reports_rates_and_drawdown():
    result = {"setups": 3, "signals": [{"verdict": "NO_TRADE", "no_trade_reason": "x"}], "trades": [
        {"outcome": "STOP", "r": -1.0}, {"outcome": "STOP", "r": -1.0},
        {"outcome": "TARGET", "r": 2.0}, {"outcome": "OPEN", "r": 0.0},
    ]}
    stats = bt.summarize(result)
    assert stats["trades"] == 3 and stats["still_open"] == 1
    assert abs(stats["win_rate"] - 1 / 3) < 1e-9
    assert stats["expectancy_r"] == 0.0
    assert stats["max_drawdown_r"] == 2.0
    assert stats["worst_losing_streak"] == 2
    assert stats["no_trade"]["x"] == 1


def test_settings_overrides_parse_to_the_right_types():
    assert bt._parse_setting("min_reward_to_risk=2.5") == ("min_reward_to_risk", 2.5)
    assert bt._parse_setting("setup_expiry_candles=30") == ("setup_expiry_candles", 30)
    assert bt._parse_setting("reject_weak_confirmation=false") == ("reject_weak_confirmation", False)
    assert bt._parse_setting("htf_filter_mode=strict_veto") == ("htf_filter_mode", "strict_veto")
