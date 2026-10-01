"""GUDA SPECIAL orchestrator — the setup state machine.

Two entry points: `detect_new_setups()` finds a fresh Break of Structure
and starts tracking it; `advance_setup()` walks an already-open setup
through the rest of the pipeline (impulse -> Fibonacci -> retracement ->
structure retest -> candle confirmation -> final gates) using the same
"each stage can only advance or terminate, never skip a mandatory stage"
spirit as engine.py's veto-gate chain — except here the chain advances a
state machine forward rather than only ever downgrading a single verdict.

Every mandatory condition below has to pass on its own; nothing here
computes a confidence/quality score that could substitute for a missing
one (that's a later phase, and even then it's diagnostic only). A setup
that fails or times out is just as much a real output as one that
publishes a BUY/SELL — every terminal INVALIDATED/EXPIRED transition
produces a structured NO_TRADE signal, never silence.
"""

from . import candle_quality, confluence, entry_zone as ez, fibonacci, htf_filter, impulse as imp
from . import patterns as pat, price_range, retest, structural_stop, structure as struct
from . import indicators as ind, volatility_regime as vol_regime

CONFIRMATION_PATTERNS = {
    1: {"Bullish Engulfing", "Morning Star"},
    -1: {"Bearish Engulfing", "Evening Star"},
}

_FORMATION_SIZE = {
    "Bullish Engulfing": 2, "Bearish Engulfing": 2,
    "Morning Star": 3, "Evening Star": 3,
}


def detect_new_setups(candles, settings=None):
    """Whether the latest closed candle just produced a fresh Break of
    Structure. Returns a dict describing the new setup to create, or None.
    Idempotent by design: the caller inserts with the setup's own
    (symbol, timeframe, strategy_version, bos_candle_time) identity under
    an ignore-duplicates upsert, so re-running this against a candle
    that's already produced a setup is a safe no-op."""
    settings = settings or {}
    swings = struct.swing_points(candles, settings.get("swing_lookback", 2))
    trend = struct.bias(swings)
    break_event = struct.break_of_structure(candles, swings, trend)
    if break_event is None:
        return None

    # Only the FIRST close beyond the level is the break. Until a new swing
    # confirms (swing_lookback candles later), every following candle that
    # is still beyond the same level reads as a "break" too — and each has
    # its own bos_candle_time, so the identity dedupe can't catch it. That
    # used to open one setup per candle for a single broken level, each able
    # to publish its own signal: one trade idea at several times the risk.
    if len(candles) >= 2 and _beyond(candles[-2]["close"], break_event["level"], break_event["direction"]):
        return None

    break_candle = candles[-1]
    atr_val = ind.atr(candles, 14)
    strength = imp.classify_break(break_candle, break_event["level"], atr_val)

    return {
        "bos_candle_time": break_candle["open_time"],
        "bos_kind": break_event["kind"],
        "bos_direction": break_event["direction"],
        "bos_price": break_event["level"],
        "break_strength": strength,
    }


def advance_setup(setup, candles, htf_candles, timeframe_seconds, settings=None, event_blackout=None):
    """Walks one open setup forward given fresh candle history. Returns
    {"setup": <updated fields>, "signal": <guda_special_signals row or
    None>}. `setup` is the current signal_lifecycle-style row (state,
    bos_direction, bos_price, bos_candle_time, and, once measured, the
    impulse/fib fields — see below). `candles`/`htf_candles` are this
    run's freshest mirrored history for the setup's own timeframe and the
    1H context timeframe respectively. `event_blackout` is the high-impact
    economic release this run sits inside the risk window of for the
    setup's instrument (event_risk.blackout()'s return), or None."""
    settings = settings or {}
    direction = setup["bos_direction"]
    bos_level = setup["bos_price"]
    latest = candles[-1]
    atr_val = ind.atr(candles, 14)

    # Volatility-regime context (src/signals/volatility_regime.py, the
    # same shared classifier the confluence engine now also populates) —
    # informational only, computed once here and threaded through every
    # exit path below, never read by any of this function's own gates.
    vol_regime_label = vol_regime.classify(atr_val, ind.atr(candles, 100))

    # Universal override 1: the break failed — price closed back through
    # the level it broke. Checked before anything else, at any stage.
    if imp.single_level_swept(latest, bos_level, direction):
        return _invalidated(setup, latest, "price closed back through the broken structure level", vol_regime_label)

    # Universal override 2: the setup has run out of time.
    elapsed_candles = (latest["open_time"] - setup["bos_candle_time"]) / timeframe_seconds
    if elapsed_candles >= settings.get("setup_expiry_candles", 20):
        return _expired(setup, latest, vol_regime_label)

    swings = struct.swing_points(candles, settings.get("swing_lookback", 2))

    # The impulse ORIGIN is frozen once, the first run the leg clears the
    # minimum size filter — pinned so later swings (the pullback's own low,
    # most obviously) can never be mistaken for it. The impulse END is not:
    # it trails the most extreme price reached since the break. Setups are
    # first advanced on the break candle itself, so freezing the end there
    # measured the Fibonacci zone off a move that was still running — the
    # whole zone landed below the level that just broke, where price can't
    # trade without closing back through it and invalidating the setup.
    # Measured against the full leg, the zone and the broken level line up.
    if setup.get("impulse_start_price") is None:
        impulse_leg = imp.measure_impulse(candles, swings, direction)
        if not imp.impulse_clears_minimum(impulse_leg, atr_val, settings.get("min_impulse_atr_multiple", 1.5)):
            return _unchanged(setup, "BOS_DETECTED")
        start, end = impulse_leg["start_price"], impulse_leg["end_price"]
    else:
        start, end = setup["impulse_start_price"], setup["impulse_end_price"]

    extreme = _extreme_since(candles, setup["bos_candle_time"], direction)
    if extreme is not None and _beyond(extreme, end, direction):
        end = extreme

    if start != setup.get("impulse_start_price") or end != setup.get("impulse_end_price"):
        setup = {
            **setup,
            "impulse_start_price": start,
            "impulse_end_price": end,
            "impulse_atr_multiple": abs(end - start) / atr_val if atr_val else None,
            **fibonacci.levels(start, end, direction),
        }
        # Fall through — a large enough impulse can already be retraced
        # into the zone by this same candle, no need to wait a run.

    fib_levels = {k: setup[k] for k in ("fib_50", "fib_61_8", "fib_72", "fib_78_6")}
    quality = fibonacci.retracement_quality(
        setup["impulse_start_price"], setup["impulse_end_price"], latest["close"], direction,
        settings.get("fib_valid_min", 0.5), settings.get("fib_valid_max", 0.786), settings.get("fib_deep_max", 0.886),
    )
    if quality == "FAILED":
        return _invalidated(setup, latest, "price retraced beyond the impulse origin", vol_regime_label)
    if quality != "VALID":
        return _unchanged(setup, "AWAITING_RETRACEMENT")

    # Price is in the primary zone. The broken level must also be acting
    # as support/resistance, not just something price passed through.
    if not retest.structure_retest_confirmed(candles, bos_level, direction):
        return _unchanged(setup, "RETEST_PENDING")

    zone = fibonacci.retracement_zone(fib_levels, latest["close"], atr_val)
    if zone is None or not zone["inside_zone"]:
        return _unchanged(setup, "AWAITING_CONFIRMATION")

    # The confirmation reverses the PULLBACK, so the pattern is read against
    # the pullback's direction — a Bullish Engulfing at the bottom of a
    # down-move into support. patterns.detect() (correctly, for the
    # confluence engine) only reports an engulfing that goes against the
    # trend it's given; handing it the break direction instead meant an
    # Engulfing could never confirm any setup, only a Morning/Evening Star.
    pullback_trend = "down" if direction == 1 else "up"
    events = pat.detect(candles, pullback_trend)
    wanted = CONFIRMATION_PATTERNS[direction]
    confirmation = next((e for e in events if e["name"] in wanted), None)
    if confirmation is None:
        return _unchanged(setup, "AWAITING_CONFIRMATION")

    # A pattern whose confirming candle is mostly wick (body under 30% of
    # its range) matched the shape but not the conviction — keep watching
    # for a decisive one rather than trading an indecisive close.
    quality_label = candle_quality.classify(latest)
    if quality_label == "WEAK" and settings.get("reject_weak_confirmation", True):
        return _unchanged(setup, "AWAITING_CONFIRMATION")

    formation_size = _FORMATION_SIZE[confirmation["name"]]
    formation_candles = candles[-formation_size:]

    entry = latest["close"]
    stop = structural_stop.stop_from_formation(
        formation_candles, direction, settings.get("structural_stop_buffer_atr", 0.25), atr_val, anchor_level=bos_level
    )
    if stop is None:
        return _invalidated(setup, latest, "no ATR available to size the stop", vol_regime_label)

    ok, reason = structural_stop.sanity_check(
        entry, stop, atr_val,
        settings.get("max_stop_distance_atr", 3.0), settings.get("min_stop_distance_atr", 0.3),
    )
    if not ok:
        return _invalidated(setup, latest, reason, vol_regime_label)

    # Room to pay: the nearest structure price has to get through (the
    # impulse's own extreme, or any swing formed since the break) must sit
    # at least min_reward_to_risk away. A 2R target beyond a wall at 1R is a
    # 1R trade in practice. Waits rather than invalidates — a deeper
    # confirmation later shrinks the risk and can clear this.
    risk = abs(entry - stop)
    obstacle = _nearest_obstacle(swings, setup, entry, direction)
    min_rr = settings.get("min_reward_to_risk", 1.8)
    if obstacle is not None and risk > 0 and abs(obstacle - entry) / risk < min_rr:
        return _unchanged(setup, "AWAITING_CONFIRMATION")

    rr = settings.get("reward_to_risk", 2.0)
    target = structural_stop.target_from_rr(entry, stop, rr, direction)

    conflict = structural_stop.target_conflict(swings, entry, target, direction)
    policy = settings.get("target_conflict_policy", "downgrade")
    if conflict and policy == "reject":
        return _invalidated(setup, latest, "major structure sits between entry and target", vol_regime_label)

    # Entry-extension filter: if price has already run too far from the
    # ideal Fib entry, wait for a better price rather than chasing —
    # never an outright invalidation, the setup just keeps watching.
    extension = fibonacci.retracement_zone(fib_levels, entry, atr_val)
    if extension and ez.distance_exceeds(extension, settings.get("max_entry_extension_atr", 0.75)):
        return _unchanged(setup, "AWAITING_CONFIRMATION")

    htf_bias = confluence.higher_timeframe_bias(htf_candles) if htf_candles else None
    htf_result = htf_filter.evaluate(direction, htf_bias, settings.get("htf_filter_mode", "downgrade"))
    if htf_result["outcome"] == "REJECTED":
        return _invalidated(setup, latest, htf_result["reason"], vol_regime_label)

    # A CHoCH setup already trades against this timeframe's own structure;
    # with the 1H against it too, it's counter-trend on both — vetoed
    # whatever htf_filter_mode says. A BOS (with-trend) setup keeps the
    # admin's configured mode.
    if setup["bos_kind"] == "CHoCH" and htf_result["outcome"] == "DOWNGRADED":
        return _invalidated(setup, latest, f"counter-trend change of character with the 1H bias ({htf_bias}) against it", vol_regime_label)

    # Inside a high-impact release's risk window (gold only — see
    # config.EVENT_RISK_CURRENCY), hold rather than publish: the same rule
    # the confluence engine applies. Not an invalidation — the setup keeps
    # watching and can still confirm once the window has passed.
    if event_blackout is not None:
        return _unchanged(setup, "AWAITING_CONFIRMATION")

    regime = struct.regime(struct.bias(swings), struct.break_of_structure(candles, swings, struct.bias(swings)))
    verdict = "BUY" if direction == 1 else "SELL"
    reasoning = (
        f"{confirmation['name']} ({quality_label.lower()}) confirmed inside the "
        f"{settings.get('fib_valid_min', 0.5)*100:.0f}-{settings.get('fib_valid_max', 0.786)*100:.0f}% "
        f"retracement zone, {setup['break_strength'].lower()} break of structure at {bos_level:.2f}, "
        f"{htf_result['reason']}."
    )
    signal = {
        "verdict": verdict,
        "price": entry,
        "no_trade_reason": None,
        "bos_kind": setup["bos_kind"],
        "bos_direction": direction,
        "bos_price": bos_level,
        "break_strength": setup["break_strength"],
        "impulse_start_price": setup["impulse_start_price"],
        "impulse_end_price": setup["impulse_end_price"],
        "impulse_atr_multiple": setup["impulse_atr_multiple"],
        **fib_levels,
        "retracement_quality": quality,
        "retest_confirmed": True,
        "confirmation_pattern": confirmation["name"],
        "candle_quality": quality_label,
        "htf_bias": htf_bias,
        "htf_filter_outcome": htf_result["outcome"],
        "entry": entry,
        "stop": stop,
        "target": target,
        "risk_reward": rr,
        "regime": regime,
        "volatility_regime": vol_regime_label,
        **_range_fields(setup["impulse_start_price"], setup["impulse_end_price"], entry),
        "reasoning": reasoning,
    }
    return {"setup": {**setup, "state": "PUBLISHED"}, "signal": signal}


def _beyond(price, level, direction):
    """Whether `price` is past `level` in the break direction."""
    return price > level if direction == 1 else price < level


def _extreme_since(candles, since_time, direction):
    """The highest high (bullish) or lowest low (bearish) from the break
    candle onward, or None if no candle is that recent."""
    window = [c for c in candles if c["open_time"] >= since_time]
    if not window:
        return None
    return max(c["high"] for c in window) if direction == 1 else min(c["low"] for c in window)


def _nearest_obstacle(swings, setup, entry, direction):
    """The closest structure between entry and the trade's target side: the
    impulse's own extreme (price has to get back through it), plus any swing
    on that side confirmed since the break. Older swings are left out —
    most were already traded through on the way to this break."""
    kind = "high" if direction == 1 else "low"
    levels = [setup["impulse_end_price"]] + [
        s["price"] for s in swings if s["kind"] == kind and s["open_time"] >= setup["bos_candle_time"]
    ]
    ahead = [lvl for lvl in levels if lvl is not None and _beyond(lvl, entry, direction)]
    if not ahead:
        return None
    return min(ahead) if direction == 1 else max(ahead)


def _unchanged(setup, state):
    return {"setup": {**setup, "state": state}, "signal": None}


def _range_fields(impulse_start, impulse_end, price):
    """Premium/discount range position (src/signals/price_range.py) over
    the setup's own measured impulse leg — the same leg Fibonacci is
    already read against. None/None before the impulse is measured yet
    (early invalidations/NO_TRADE outcomes have no leg to measure from)."""
    if impulse_start is None or impulse_end is None:
        return {"range_position_pct": None, "range_zone": None}
    rng = price_range.analyze(max(impulse_start, impulse_end), min(impulse_start, impulse_end), price)
    if rng is None:
        return {"range_position_pct": None, "range_zone": None}
    return {"range_position_pct": rng["position_pct"], "range_zone": rng["zone"]}


def _invalidated(setup, latest, reason, vol_regime_label=None):
    return {
        "setup": {**setup, "state": "INVALIDATED", "invalidation_reason": reason},
        "signal": _no_trade_signal(setup, latest, reason, vol_regime_label),
    }


def _expired(setup, latest, vol_regime_label=None):
    reason = "setup expired with no resolution"
    return {
        "setup": {**setup, "state": "EXPIRED", "invalidation_reason": reason},
        "signal": _no_trade_signal(setup, latest, reason, vol_regime_label),
    }


def _no_trade_signal(setup, latest, reason, vol_regime_label=None):
    return {
        "verdict": "NO_TRADE",
        "price": latest["close"],
        "no_trade_reason": reason,
        "bos_kind": setup["bos_kind"],
        "bos_direction": setup["bos_direction"],
        "bos_price": setup["bos_price"],
        "break_strength": setup.get("break_strength"),
        "impulse_start_price": setup.get("impulse_start_price"),
        "impulse_end_price": setup.get("impulse_end_price"),
        "impulse_atr_multiple": setup.get("impulse_atr_multiple"),
        "fib_50": setup.get("fib_50"),
        "fib_61_8": setup.get("fib_61_8"),
        "fib_72": setup.get("fib_72"),
        "fib_78_6": setup.get("fib_78_6"),
        "retracement_quality": None,
        "retest_confirmed": None,
        "confirmation_pattern": None,
        "candle_quality": None,
        "htf_bias": None,
        "htf_filter_outcome": None,
        "entry": None,
        "stop": None,
        "target": None,
        "risk_reward": None,
        "regime": None,
        "volatility_regime": vol_regime_label,
        **_range_fields(setup.get("impulse_start_price"), setup.get("impulse_end_price"), latest["close"]),
        "reasoning": f"NO TRADE — {reason}",
    }
