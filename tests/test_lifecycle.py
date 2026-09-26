from src.signals import lifecycle

# BUY signal fixture: entry 100, stop 95 (risk 5), invalidation 94,
# entry zone [99, 101] (half-width 1). Generated at candle_time 0 on a
# 3600s (1h) timeframe.
BUY_SIGNAL = {
    "verdict": "BUY",
    "entry": 100.0,
    "stop": 95.0,
    "invalidation_level": 94.0,
    "entry_zone_low": 99.0,
    "entry_zone_high": 101.0,
    "candle_time": 0,
}

SELL_SIGNAL = {
    "verdict": "SELL",
    "entry": 100.0,
    "stop": 105.0,
    "invalidation_level": 106.0,
    "entry_zone_low": 99.0,
    "entry_zone_high": 101.0,
    "candle_time": 0,
}

HOUR = 3600


def _row(state, candle_time=0):
    return {"state": state, "entered_at": 0, "candle_time": candle_time}


def _buy_result(**overrides):
    base = {
        "verdict": "BUY",
        "levels": {"entry": 100.0, "stop": 95.0, "target": 110.0, "buy_above": None, "sell_below": None},
        "invalidation_level": 94.0,
        "entry_zone_low": 99.0,
        "entry_zone_high": 101.0,
    }
    return {**base, **overrides}


# --- tracks() ---------------------------------------------------------


def test_tracks_a_full_directional_call():
    assert lifecycle.tracks(_buy_result()) is True


def test_tracks_rejects_hold():
    assert lifecycle.tracks(_buy_result(verdict="HOLD")) is False


def test_tracks_rejects_a_call_with_no_levels():
    assert lifecycle.tracks(_buy_result(levels=None)) is False


def test_tracks_rejects_atr_fallback_with_no_invalidation_level():
    assert lifecycle.tracks(_buy_result(invalidation_level=None)) is False


def test_tracks_rejects_atr_fallback_with_no_entry_zone():
    assert lifecycle.tracks(_buy_result(entry_zone_low=None, entry_zone_high=None)) is False


# --- next_state(): raw state from price -------------------------------


def test_wait_when_price_is_far_from_the_zone():
    # distance from zone_high (101) is 3, half-width 1 -> 3 half-widths, beyond the default watch band (2), and
    # not favorable enough (0.8R) to confirm (1.0R) either.
    result = lifecycle.next_state(_row("WAIT"), BUY_SIGNAL, price=104.0, candle_time_now=HOUR, timeframe_seconds=HOUR)
    assert result == "WAIT"


def test_watch_when_price_is_near_but_outside_the_zone():
    # distance from zone_high (101) is 1, half-width 1 -> 1 half-width, within the default watch band (2).
    result = lifecycle.next_state(_row("WAIT"), BUY_SIGNAL, price=102.0, candle_time_now=HOUR, timeframe_seconds=HOUR)
    assert result == "WATCH"


def test_ready_when_price_is_inside_the_zone():
    result = lifecycle.next_state(_row("WATCH"), BUY_SIGNAL, price=100.0, candle_time_now=HOUR, timeframe_seconds=HOUR)
    assert result == "READY"


def test_confirmed_when_price_has_moved_a_full_risk_unit_favorably():
    # entry 100, risk 5 -> confirmed at 105 (favorable_r == 1.0, default confirm_r).
    result = lifecycle.next_state(_row("READY"), BUY_SIGNAL, price=105.0, candle_time_now=HOUR, timeframe_seconds=HOUR)
    assert result == "CONFIRMED"


def test_a_sell_signal_confirms_on_a_favorable_downward_move():
    # SELL entry 100, stop 105 -> risk 5, confirmed at 95.
    result = lifecycle.next_state(_row("READY"), SELL_SIGNAL, price=95.0, candle_time_now=HOUR, timeframe_seconds=HOUR)
    assert result == "CONFIRMED"


# --- invalidation, checked first, overrides everything -----------------


def test_invalidated_when_price_breaches_the_level_on_a_buy():
    result = lifecycle.next_state(_row("READY"), BUY_SIGNAL, price=94.0, candle_time_now=HOUR, timeframe_seconds=HOUR)
    assert result == "INVALIDATED"


def test_invalidated_when_price_breaches_the_level_on_a_sell():
    result = lifecycle.next_state(_row("WATCH"), SELL_SIGNAL, price=106.0, candle_time_now=HOUR, timeframe_seconds=HOUR)
    assert result == "INVALIDATED"


def test_invalidation_overrides_even_a_stale_signal_past_its_expiry():
    elapsed = 25 * HOUR  # past the default 20-candle expiry
    result = lifecycle.next_state(_row("WATCH"), BUY_SIGNAL, price=93.0, candle_time_now=elapsed, timeframe_seconds=HOUR)
    assert result == "INVALIDATED"


# --- forward-only progression -------------------------------------------


def test_a_pullback_that_does_not_reach_invalidation_does_not_regress():
    # Price at 96 sits between invalidation (94) and the zone (99-101) —
    # a pullback, not an invalidation. Raw would compute WAIT (too far
    # from the zone), but a row already at READY must not regress.
    result = lifecycle.next_state(_row("READY"), BUY_SIGNAL, price=96.0, candle_time_now=HOUR, timeframe_seconds=HOUR)
    assert result == "READY"


def test_a_signal_can_jump_straight_from_wait_to_confirmed():
    # No requirement to pass through every state one recheck at a time —
    # a large favorable gap move confirms directly.
    result = lifecycle.next_state(_row("WAIT"), BUY_SIGNAL, price=106.0, candle_time_now=HOUR, timeframe_seconds=HOUR)
    assert result == "CONFIRMED"


def test_confirmed_never_reevaluates_past_itself():
    result = lifecycle.next_state(_row("CONFIRMED"), BUY_SIGNAL, price=200.0, candle_time_now=HOUR, timeframe_seconds=HOUR)
    assert result == "CONFIRMED"


# --- expiry --------------------------------------------------------------


def test_no_expiry_before_the_threshold():
    elapsed = 5 * HOUR  # well under the default 20-candle expiry
    result = lifecycle.next_state(_row("WAIT"), BUY_SIGNAL, price=104.0, candle_time_now=elapsed, timeframe_seconds=HOUR)
    assert result == "WAIT"


def test_expiry_fires_once_enough_candles_have_elapsed_with_no_resolution():
    elapsed = 20 * HOUR  # exactly the default 20-candle expiry
    result = lifecycle.next_state(_row("WATCH"), BUY_SIGNAL, price=104.0, candle_time_now=elapsed, timeframe_seconds=HOUR)
    assert result == "EXPIRED"


def test_expiry_overrides_a_stale_signal_even_if_it_just_reached_ready():
    # An entry opportunity that only became actionable after the window
    # closed is stale, not a fresh READY.
    elapsed = 25 * HOUR
    result = lifecycle.next_state(_row("WATCH"), BUY_SIGNAL, price=100.0, candle_time_now=elapsed, timeframe_seconds=HOUR)
    assert result == "EXPIRED"


def test_expiry_never_overrides_confirmed():
    elapsed = 25 * HOUR
    result = lifecycle.next_state(_row("READY"), BUY_SIGNAL, price=105.0, candle_time_now=elapsed, timeframe_seconds=HOUR)
    assert result == "CONFIRMED"


# --- admin-configurable thresholds ---------------------------------------


def test_confirm_move_r_is_configurable():
    settings = {"lifecycle_confirm_move_r": 2.0}
    # 1R (105) no longer confirms once the threshold is raised to 2R.
    result = lifecycle.next_state(_row("READY"), BUY_SIGNAL, price=105.0, candle_time_now=HOUR, timeframe_seconds=HOUR, settings=settings)
    assert result == "READY"
    result = lifecycle.next_state(_row("READY"), BUY_SIGNAL, price=110.0, candle_time_now=HOUR, timeframe_seconds=HOUR, settings=settings)
    assert result == "CONFIRMED"


def test_watch_zone_half_widths_is_configurable():
    settings = {"lifecycle_watch_zone_half_widths": 0.5}
    # 1 half-width away (price 102) no longer counts as WATCH once the
    # band is tightened to 0.5 half-widths.
    result = lifecycle.next_state(_row("WAIT"), BUY_SIGNAL, price=102.0, candle_time_now=HOUR, timeframe_seconds=HOUR, settings=settings)
    assert result == "WAIT"


def test_expiry_candles_is_configurable():
    settings = {"lifecycle_expiry_candles": 5}
    elapsed = 6 * HOUR
    result = lifecycle.next_state(_row("WAIT"), BUY_SIGNAL, price=104.0, candle_time_now=elapsed, timeframe_seconds=HOUR, settings=settings)
    assert result == "EXPIRED"
