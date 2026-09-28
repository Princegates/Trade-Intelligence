"""GUDA SPECIAL end to end on real candles — nothing mocked.

test_setups.py mocks every category function, which is what let an
Engulfing confirmation go unreachable unnoticed: the mocks returned one no
matter what trend label setups.py handed patterns.detect(). These replay a
hand-built textbook break-and-retest through detect_new_setups() and
advance_setup() one closed candle at a time, in the same detect-then-advance
order src/run.py uses, and check what actually comes out.
"""

from src.signals import setups

TF = 900  # 15m


def _candle(i, o, c):
    # Up candles get a small lower wick, down candles a small upper wick, so
    # no two neighbouring candles tie on a high/low and every swing turn is
    # unambiguous.
    if c >= o:
        return {"open_time": i * TF, "open": o, "high": c + 0.3, "low": o - 0.1, "close": c, "volume": 1.0}
    return {"open_time": i * TF, "open": o, "high": o + 0.1, "low": c - 0.3, "close": c, "volume": 1.0}


def _textbook_bullish(retest_close=110.6):
    """Higher highs and lows (swing highs ~96.3 / 110.3, lows ~89.7 / 99.7),
    a break above 110.3, an impulse to 126.3, a pullback into the 50-78.6%
    zone whose wick retests 110.3, then a bullish engulfing at the level."""
    closes = (
        list(range(88, 97, 2)) + list(range(94, 89, -2)) + list(range(92, 111, 2))
        + list(range(108, 99, -2)) + list(range(102, 127, 2)) + list(range(124, 111, -2))
    )
    out, prev = [], 86.0
    for i, c in enumerate(closes):
        out.append(_candle(i, prev, float(c)))
        prev = float(c)
    out.append(_candle(len(out), 112.0, retest_close))
    out.append({"open_time": len(out) * TF, "open": 110.5, "high": 112.9, "low": 110.4, "close": 112.6, "volume": 1.0})
    return out


def _mirror(candles, axis=200.0):
    return [
        {"open_time": c["open_time"], "open": 2 * axis - c["open"], "high": 2 * axis - c["low"],
         "low": 2 * axis - c["high"], "close": 2 * axis - c["close"], "volume": c["volume"]}
        for c in candles
    ]


def _replay(candles, settings=None):
    """Returns (every setup ever created, every signal published)."""
    created, open_setups, signals = [], [], []
    for n in range(20, len(candles) + 1):
        window = candles[:n]
        new = setups.detect_new_setups(window, settings)
        if new and not any(s["bos_candle_time"] == new["bos_candle_time"] for s in created):
            row = {**new, "state": "BOS_DETECTED", "impulse_start_price": None, "impulse_end_price": None,
                   "impulse_atr_multiple": None, "fib_50": None, "fib_61_8": None, "fib_72": None, "fib_78_6": None}
            created.append(row)
            open_setups.append(row)
        still_open = []
        for s in open_setups:
            result = setups.advance_setup(s, window, [], TF, settings)
            if result["signal"]:
                signals.append(result["signal"])
            if result["setup"]["state"] not in ("PUBLISHED", "INVALIDATED", "EXPIRED"):
                still_open.append(result["setup"])
        open_setups = still_open
    return created, signals


def test_one_broken_level_opens_exactly_one_setup():
    created, _ = _replay(_textbook_bullish())
    assert [s["bos_price"] for s in created] == [110.3]


def test_a_textbook_bullish_break_and_retest_publishes_one_buy():
    _, signals = _replay(_textbook_bullish())
    assert len(signals) == 1
    buy = signals[0]
    assert buy["verdict"] == "BUY"
    assert buy["confirmation_pattern"] == "Bullish Engulfing"
    assert buy["entry"] == 112.6


def test_the_fibonacci_zone_is_measured_on_the_whole_impulse():
    buy = _replay(_textbook_bullish())[1][0]
    assert buy["impulse_start_price"] == 99.7
    assert buy["impulse_end_price"] == 126.3
    # ...which puts the broken level inside the 50-78.6% zone, where a
    # retest of it is also a valid retracement.
    assert buy["fib_78_6"] < buy["bos_price"] < buy["fib_50"]


def test_the_stop_sits_beyond_the_broken_level_and_the_target_is_2r():
    buy = _replay(_textbook_bullish())[1][0]
    assert buy["stop"] < buy["bos_price"]
    risk = buy["entry"] - buy["stop"]
    assert abs(buy["target"] - (buy["entry"] + 2 * risk)) < 1e-9


def test_the_mirror_image_publishes_one_sell():
    created, signals = _replay(_mirror(_textbook_bullish()))
    assert len(created) == 1
    assert len(signals) == 1
    sell = signals[0]
    assert sell["verdict"] == "SELL"
    assert sell["confirmation_pattern"] == "Bearish Engulfing"
    assert sell["stop"] > sell["bos_price"]


def test_a_retest_that_closes_back_through_the_level_is_a_no_trade():
    _, signals = _replay(_textbook_bullish(retest_close=109.5))
    assert [s["verdict"] for s in signals] == ["NO_TRADE"]
    assert "closed back through" in signals[0]["no_trade_reason"]


def test_no_room_to_the_prior_high_means_no_trade_is_published():
    # Demanding 5R of room to the 126.3 impulse high (only ~4.7R here)
    # holds the setup rather than publishing.
    _, signals = _replay(_textbook_bullish(), settings={"min_reward_to_risk": 5.0})
    assert signals == []
