"""ALIVEDESTINY orchestrator — the setup state machine.

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
from . import patterns as pat, retest, structural_stop, structure as struct, indicators as ind

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


def advance_setup(setup, candles, htf_candles, timeframe_seconds, settings=None):
    """Walks one open setup forward given fresh candle history. Returns
    {"setup": <updated fields>, "signal": <alivedestiny_signals row or
    None>}. `setup` is the current signal_lifecycle-style row (state,
    bos_direction, bos_price, bos_candle_time, and, once frozen, the
    impulse/fib fields — see below). `candles`/`htf_candles` are this
    run's freshest mirrored history for the setup's own timeframe and the
    1H context timeframe respectively."""
    settings = settings or {}
    direction = setup["bos_direction"]
    bos_level = setup["bos_price"]
    latest = candles[-1]
    atr_val = ind.atr(candles, 14)

    # Universal override 1: the break failed — price closed back through
    # the level it broke. Checked before anything else, at any stage.
    if imp.single_level_swept(latest, bos_level, direction):
        return _invalidated(setup, latest, "price closed back through the broken structure level")

    # Universal override 2: the setup has run out of time.
    elapsed_candles = (latest["open_time"] - setup["bos_candle_time"]) / timeframe_seconds
    if elapsed_candles >= settings.get("setup_expiry_candles", 20):
        return _expired(setup, latest)

    swings = struct.swing_points(candles, settings.get("swing_lookback", 2))

    # Freeze impulse + Fibonacci once, the first run it clears the minimum
    # size filter — frozen so the confirmation zone stays a stable
    # reference rather than drifting as new swings form later.
    if setup.get("impulse_start_price") is None:
        impulse_leg = imp.measure_impulse(candles, swings, direction)
        if not imp.impulse_clears_minimum(impulse_leg, atr_val, settings.get("min_impulse_atr_multiple", 1.5)):
            return _unchanged(setup, "BOS_DETECTED")
        fib_levels = fibonacci.levels(impulse_leg["start_price"], impulse_leg["end_price"], direction)
        setup = {
            **setup,
            "impulse_start_price": impulse_leg["start_price"],
            "impulse_end_price": impulse_leg["end_price"],
            "impulse_atr_multiple": (
                abs(impulse_leg["end_price"] - impulse_leg["start_price"]) / atr_val if atr_val else None
            ),
            **fib_levels,
        }
        # Fall through — a large enough impulse can already be retraced
        # into the zone by this same candle, no need to wait a run.

    fib_levels = {k: setup[k] for k in ("fib_50", "fib_61_8", "fib_72", "fib_78_6")}
    quality = fibonacci.retracement_quality(
        setup["impulse_start_price"], setup["impulse_end_price"], latest["close"], direction,
        settings.get("fib_valid_min", 0.5), settings.get("fib_valid_max", 0.786), settings.get("fib_deep_max", 0.886),
    )
    if quality == "FAILED":
        return _invalidated(setup, latest, "price retraced beyond the impulse origin")
    if quality != "VALID":
        return _unchanged(setup, "AWAITING_RETRACEMENT")

    # Price is in the primary zone. The broken level must also be acting
    # as support/resistance, not just something price passed through.
    if not retest.structure_retest_confirmed(candles, bos_level, direction):
        return _unchanged(setup, "RETEST_PENDING")

    zone = fibonacci.retracement_zone(fib_levels, latest["close"], atr_val)
    if zone is None or not zone["inside_zone"]:
        return _unchanged(setup, "AWAITING_CONFIRMATION")

    trend_label = "up" if direction == 1 else "down"
    events = pat.detect(candles, trend_label)
    wanted = CONFIRMATION_PATTERNS[direction]
    confirmation = next((e for e in events if e["name"] in wanted), None)
    if confirmation is None:
        return _unchanged(setup, "AWAITING_CONFIRMATION")

    formation_size = _FORMATION_SIZE[confirmation["name"]]
    formation_candles = candles[-formation_size:]
    quality_label = candle_quality.classify(latest)

    entry = latest["close"]
    stop = structural_stop.stop_from_formation(
        formation_candles, direction, settings.get("structural_stop_buffer_atr", 0.25), atr_val
    )
    if stop is None:
        return _invalidated(setup, latest, "no ATR available to size the stop")

    ok, reason = structural_stop.sanity_check(
        entry, stop, atr_val,
        settings.get("max_stop_distance_atr", 3.0), settings.get("min_stop_distance_atr", 0.3),
    )
    if not ok:
        return _invalidated(setup, latest, reason)

    rr = settings.get("reward_to_risk", 2.0)
    target = structural_stop.target_from_rr(entry, stop, rr, direction)

    conflict = structural_stop.target_conflict(swings, entry, target, direction)
    policy = settings.get("target_conflict_policy", "downgrade")
    if conflict and policy == "reject":
        return _invalidated(setup, latest, "major structure sits between entry and target")

    # Entry-extension filter: if price has already run too far from the
    # ideal Fib entry, wait for a better price rather than chasing —
    # never an outright invalidation, the setup just keeps watching.
    extension = fibonacci.retracement_zone(fib_levels, entry, atr_val)
    if extension and ez.distance_exceeds(extension, settings.get("max_entry_extension_atr", 0.75)):
        return _unchanged(setup, "AWAITING_CONFIRMATION")

    htf_bias = confluence.higher_timeframe_bias(htf_candles) if htf_candles else None
    htf_result = htf_filter.evaluate(direction, htf_bias, settings.get("htf_filter_mode", "downgrade"))
    if htf_result["outcome"] == "REJECTED":
        return _invalidated(setup, latest, htf_result["reason"])

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
        "reasoning": reasoning,
    }
    return {"setup": {**setup, "state": "PUBLISHED"}, "signal": signal}


def _unchanged(setup, state):
    return {"setup": {**setup, "state": state}, "signal": None}


def _invalidated(setup, latest, reason):
    return {
        "setup": {**setup, "state": "INVALIDATED", "invalidation_reason": reason},
        "signal": _no_trade_signal(setup, latest, reason),
    }


def _expired(setup, latest):
    reason = "setup expired with no resolution"
    return {
        "setup": {**setup, "state": "EXPIRED", "invalidation_reason": reason},
        "signal": _no_trade_signal(setup, latest, reason),
    }


def _no_trade_signal(setup, latest, reason):
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
        "reasoning": f"NO TRADE — {reason}",
    }
