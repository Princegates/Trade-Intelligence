"""Signal lifecycle state — Phase 2b of the entry-quality engine.

Everything else in this codebase computes a signal once, at generation
time, and leaves it alone (signals is hard append-only, see
web/supabase/migrations/0003_signals_append_only.sql). This module is the
one piece that changes over time: as new candles close after a signal
publishes, its lifecycle state moves through WAIT -> WATCH -> READY ->
CONFIRMED, or resolves early to INVALIDATED/EXPIRED. See src/run.py's
recheck_lifecycles() for the I/O that drives this — everything here is
pure, fed only already-known numbers (the signal's own fixed entry/stop/
invalidation/entry-zone levels, and a fresh price), never a re-run of
engine.evaluate() or a fresh ATR.
"""

ORDER = ["WAIT", "WATCH", "READY", "CONFIRMED"]
TERMINAL = {"CONFIRMED", "INVALIDATED", "EXPIRED"}


def tracks(result):
    """Whether a just-generated signal (an engine.evaluate() result dict)
    gets a lifecycle row at all. HOLD never does — no entry/invalidation/
    zone at all. Neither does a directional call that fell back to pure-
    ATR sizing (no nearby structural swing yet, so entry_zone/
    invalidation_level are also both None per entry_zone.py's own "None
    when there's no level" contract): WAIT/WATCH/READY are inherently
    about a structural entry band, and a call with no structural band has
    nothing for them to describe."""
    levels = result.get("levels")
    return (
        result["verdict"] in ("BUY", "SELL")
        and levels is not None
        and levels.get("entry") is not None
        and result.get("invalidation_level") is not None
        and result.get("entry_zone_low") is not None
        and result.get("entry_zone_high") is not None
    )


def next_state(row, signal, price, candle_time_now, timeframe_seconds, settings=None):
    """The lifecycle state a tracked signal should move to on this
    re-check.

    `row` is the current signal_lifecycle row (its "state" is always one
    of WAIT/WATCH/READY — terminal rows are excluded from the re-check
    query that calls this). `signal` is the tracked signal's own fixed
    verdict/entry/stop/invalidation_level/entry_zone_low/entry_zone_high,
    read back by identity, never recomputed. `price`/`candle_time_now` are
    the latest closed candle's close and open_time, both already epoch
    numbers."""
    settings = settings or {}
    verdict = signal["verdict"]
    entry, stop = signal["entry"], signal["stop"]
    inval = signal["invalidation_level"]
    zone_low, zone_high = signal["entry_zone_low"], signal["entry_zone_high"]

    # 1. Invalidation — terminal, checked first, overrides everything else.
    if (verdict == "BUY" and price <= inval) or (verdict == "SELL" and price >= inval):
        return "INVALIDATED"

    # 2. Raw state purely from where price sits right now, measured in
    # risk-units (favorable_r) and zone half-widths (distance/hw) — both
    # fixed numbers from generation time, so this never needs a fresh ATR.
    risk = abs(entry - stop)
    favorable_r = (price - entry) / risk if verdict == "BUY" else (entry - price) / risk
    confirm_r = settings.get("lifecycle_confirm_move_r", 1.0)
    watch_hw = settings.get("lifecycle_watch_zone_half_widths", 2.0)
    hw = (zone_high - zone_low) / 2
    inside_zone = zone_low <= price <= zone_high

    if favorable_r >= confirm_r:
        raw = "CONFIRMED"
    elif inside_zone:
        raw = "READY"
    else:
        distance = min(abs(price - zone_low), abs(price - zone_high))
        raw = "WATCH" if hw > 0 and distance / hw <= watch_hw else "WAIT"

    # 3. Forward-only — never regress on a pullback that hasn't reached
    # invalidation. CONFIRMED is terminal: once reached, tracking is done.
    new_index = max(ORDER.index(row["state"]), ORDER.index(raw))
    if ORDER[new_index] == "CONFIRMED":
        return "CONFIRMED"

    # 4. Expiry — counted in candles of the signal's OWN timeframe, not
    # wall-clock seconds, so a 5m signal expires far sooner in real time
    # than a 1d one without any per-timeframe lookup table.
    expiry_candles = settings.get("lifecycle_expiry_candles", 20)
    elapsed = (candle_time_now - signal["candle_time"]) / timeframe_seconds
    if elapsed >= expiry_candles:
        return "EXPIRED"

    return ORDER[new_index]
