import pytest

from src import trade_sim as sim


def _bar(t, o, h, low, c):
    return {"open_time": t, "open": o, "high": h, "low": low, "close": c}


def _buy(cost_pct=0.0):
    # Entry 100, stop 98 (risk 2), target 104 (2R).
    return sim.open_trade(1, 100.0, 98.0, 104.0, signal_time=0, cost_pct=cost_pct)


def _sell(cost_pct=0.0):
    return sim.open_trade(-1, 100.0, 102.0, 96.0, signal_time=0, cost_pct=cost_pct)


# --- open_trade ----------------------------------------------------------------


def test_levels_on_the_wrong_side_are_not_a_trade():
    assert sim.open_trade(1, 100.0, 101.0, 104.0, 0, 0.0) is None  # stop above a buy
    assert sim.open_trade(-1, 100.0, 102.0, 101.0, 0, 0.0) is None  # target above a sell
    assert sim.open_trade(1, 100.0, 100.0, 104.0, 0, 0.0) is None  # zero risk
    assert sim.open_trade(1, 100.0, None, 104.0, 0, 0.0) is None


def test_costs_are_converted_to_r():
    # 0.2% of 100 = 0.2, over a risk of 2 = 0.1R.
    assert _buy(cost_pct=0.2)["r_cost"] == pytest.approx(0.1)


# --- advance -------------------------------------------------------------------


def test_target_is_the_full_reward_in_r():
    t = sim.advance(_buy(), [_bar(1, 100, 101, 99, 101), _bar(2, 101, 104.5, 100.5, 104)], max_bars=50)
    assert t["status"] == "TARGET"
    assert t["r_gross"] == pytest.approx(2.0)
    assert t["exit_time"] == 2
    assert t["bars"] == 2


def test_a_wick_through_the_stop_is_a_stop_even_if_it_closes_back_above():
    t = sim.advance(_buy(), [_bar(1, 100, 100.5, 97.9, 99.5)], max_bars=50)
    assert t["status"] == "STOP"
    assert t["r_gross"] == pytest.approx(-1.0)


def test_a_candle_touching_both_counts_as_the_stop():
    t = sim.advance(_buy(), [_bar(1, 100, 105, 97, 104)], max_bars=50)
    assert t["status"] == "STOP"


def test_a_gap_past_the_stop_fills_at_the_open():
    t = sim.advance(_buy(), [_bar(1, 97, 97.5, 96, 97)], max_bars=50)
    assert t["status"] == "STOP"
    assert t["exit_price"] == 97
    assert t["r_gross"] == pytest.approx(-1.5)


def test_an_unresolved_trade_times_out_at_the_close():
    bars = [_bar(i, 100, 101, 99, 100.5) for i in range(1, 4)]
    t = sim.advance(_buy(), bars, max_bars=3)
    assert t["status"] == "TIMEOUT"
    assert t["exit_price"] == 100.5
    assert t["r_gross"] == pytest.approx(0.25)


def test_costs_come_off_every_result():
    t = sim.advance(_buy(cost_pct=0.2), [_bar(1, 100, 104.5, 99, 104)], max_bars=50)
    assert t["r_net"] == pytest.approx(2.0 - 0.1)


def test_a_sell_mirrors():
    assert sim.advance(_sell(), [_bar(1, 100, 100.5, 95.5, 96)], 50)["status"] == "TARGET"
    assert sim.advance(_sell(), [_bar(1, 100, 102.5, 99, 101)], 50)["status"] == "STOP"


def test_advancing_is_incremental_and_skips_candles_already_seen():
    first = sim.advance(_buy(), [_bar(1, 100, 101, 99, 100)], max_bars=50)
    assert first["status"] == sim.OPEN and first["bars"] == 1
    # The same candle again plus one new one: only the new one counts.
    again = sim.advance(first, [_bar(1, 100, 101, 99, 100), _bar(2, 100, 101.5, 99.5, 101)], max_bars=50)
    assert again["bars"] == 2
    assert again["mfe_r"] == pytest.approx(0.75)
    assert again["mae_r"] == pytest.approx(0.5)


def test_a_closed_trade_is_left_alone():
    closed = sim.advance(_buy(), [_bar(1, 100, 104.5, 99, 104)], max_bars=50)
    assert sim.advance(closed, [_bar(2, 104, 110, 90, 95)], max_bars=50) is closed


def test_advance_does_not_mutate_its_input():
    trade = _buy()
    sim.advance(trade, [_bar(1, 100, 101, 99, 100)], max_bars=50)
    assert trade["bars"] == 0


# --- summarize -----------------------------------------------------------------


def _closed(r_net, exit_time, status="TARGET"):
    return {"status": status, "r_net": r_net, "r_gross": r_net, "r_cost": 0.0, "exit_time": exit_time, "bars": 5}


def test_summary_figures():
    trades = [
        _closed(2.0, 1),
        _closed(-1.0, 2, "STOP"),
        _closed(-1.0, 3, "STOP"),
        _closed(2.0, 4),
        {"status": "OPEN", "r_net": None, "r_gross": None, "r_cost": 0.0, "exit_time": None, "bars": 1},
    ]
    s = sim.summarize(trades)
    assert s["trades"] == 4
    assert s["open"] == 1
    assert s["win_rate"] == pytest.approx(0.5)
    assert s["avg_r_net"] == pytest.approx(0.5)
    assert s["total_r_net"] == pytest.approx(2.0)
    assert s["profit_factor"] == pytest.approx(2.0)
    assert s["max_drawdown_r"] == pytest.approx(2.0)
    assert s["worst_losing_streak"] == 2
    assert s["stop_rate"] == pytest.approx(0.5)


def test_summary_orders_by_exit_time_not_input_order():
    s = sim.summarize([_closed(-1.0, 3, "STOP"), _closed(2.0, 1), _closed(-1.0, 2, "STOP")])
    assert s["max_drawdown_r"] == pytest.approx(2.0)
    assert s["worst_losing_streak"] == 2


def test_summary_of_nothing():
    s = sim.summarize([])
    assert s["trades"] == 0
    assert s["win_rate"] is None
    assert s["profit_factor"] is None


# --- limit entries ------------------------------------------------------------


def _limit_buy(fill_window=3):
    # A limit to buy at 100 placed while price is higher; stop 98, target 104.
    return sim.open_trade(1, 100.0, 98.0, 104.0, 0, 0.0, pending=True, fill_window=fill_window)


def test_a_limit_waits_until_price_comes_back_then_fills_at_the_limit():
    t = sim.advance(_limit_buy(), [_bar(1, 101, 102, 100.5, 101.5), _bar(2, 101.5, 101.6, 99.8, 100.4)], 50)
    assert t["status"] == sim.OPEN
    assert t["bars"] == 1
    later = sim.advance(t, [_bar(3, 100.4, 104.2, 100.2, 104)], 50)
    assert later["status"] == "TARGET"
    assert later["r_gross"] == pytest.approx(2.0)


def test_a_limit_never_reached_is_cancelled_and_is_not_a_trade():
    t = sim.advance(_limit_buy(fill_window=2), [_bar(1, 101, 102, 100.5, 101.5), _bar(2, 101.5, 103, 101, 102)], 50)
    assert t["status"] == sim.CANCELLED
    s = sim.summarize([t])
    assert s["trades"] == 0 and s["cancelled"] == 1


def test_the_fill_candle_can_stop_the_trade_but_not_reach_the_target():
    stopped = sim.advance(_limit_buy(), [_bar(1, 101, 101.2, 97.5, 98.5)], 50)
    assert stopped["status"] == "STOP"
    assert stopped["r_gross"] == pytest.approx(-1.0)
    # Dips to the limit and also trades above the target in the same candle: filled, not a win yet.
    filled = sim.advance(_limit_buy(), [_bar(1, 103, 105, 99.5, 101)], 50)
    assert filled["status"] == sim.OPEN


def test_a_pending_order_counts_as_an_open_position():
    assert sim.summarize([_limit_buy()])["open"] == 1


# --- breakeven stop --------------------------------------------------------------------


def test_the_stop_moves_to_breakeven_after_the_trade_reaches_the_trigger():
    t = sim.open_trade(1, 100.0, 98.0, 104.0, 0, 0.0, be_at_r=1.0)
    t = sim.advance(t, [_bar(1, 100, 102.2, 99.5, 102), _bar(2, 102, 102.5, 99.9, 100.1)], 50)
    assert t["status"] == "STOP"
    assert t["exit_price"] == 100.0
    assert t["r_gross"] == pytest.approx(0.0)


def test_breakeven_takes_effect_from_the_next_candle_only():
    # Reaches +1R and dips below the entry in the same candle: still the original stop.
    t = sim.open_trade(1, 100.0, 98.0, 104.0, 0, 0.0, be_at_r=1.0)
    t = sim.advance(t, [_bar(1, 100, 102.2, 99, 101)], 50)
    assert t["status"] == sim.OPEN
    assert t["stop"] == 100.0


def test_without_breakeven_the_stop_never_moves():
    t = sim.advance(_buy(), [_bar(1, 100, 103, 99.5, 102), _bar(2, 102, 102.5, 99.9, 100.1)], 50)
    assert t["status"] == sim.OPEN
    assert t["stop"] == 98.0
