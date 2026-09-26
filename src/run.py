"""Entry point for the scheduled job: pull latest candles, compute signals,
store both. Run with `python -m src.run`."""

import uuid
from datetime import datetime, timezone

from . import config, quality
from .ai import commentary
from .ingest import binance, calendar, twelvedata
from .signals import confluence, engine, event_risk, lifecycle, setups
from .storage import db, supabase

ALIVEDESTINY_TIMEFRAME = "15m"
ALIVEDESTINY_HTF_TIMEFRAME = "1h"


def _mirror(publish, *args, **kwargs):
    """Push a record to Supabase, reporting failure rather than raising.

    Returns whether it got there, which callers use to decide what follows:
    a mirror failure must not be allowed to look like success."""
    try:
        publish(*args, **kwargs)
        return True
    except Exception as exc:
        print(f"[warn] not mirrored to Supabase ({exc})")
        return False


def fetch_candles(instrument, timeframe):
    if instrument["provider"] == "binance":
        return binance.fetch_klines(instrument["provider_symbol"], timeframe, limit=config.CANDLE_FETCH_LIMIT)
    if instrument["provider"] == "twelvedata":
        return twelvedata.fetch_klines(instrument["provider_symbol"], timeframe, limit=config.CANDLE_FETCH_LIMIT)
    raise ValueError(f"Unknown provider: {instrument['provider']}")


def newest_stored(symbol, timeframe):
    """open_time of the newest closed candle already held, or None.

    Read from Supabase when it is configured, because that is then the store
    that outlives the run. The workflow no longer commits the SQLite file, so
    on a fresh runner the local copy is whatever was last checked in — asking
    it would report far less than we actually hold and refetch every series
    on every run, which is what the gold quota cannot afford.
    """
    if supabase.is_configured():
        try:
            return supabase.newest_mirrored_candle(symbol, timeframe)
        except Exception as exc:
            print(f"[warn] {symbol}/{timeframe}: could not read the mirror ({exc}); using local history")
    return db.newest_complete_candle(symbol, timeframe)


def suppress(symbol, timeframe, now, reason, detail):
    db.record_suppression(symbol, timeframe, now, reason, detail)
    _mirror(supabase.publish_suppression, symbol, timeframe, now, reason, detail)


def _generate_commentary(symbol, timeframe, candle_time, price, result):
    """Best-effort AI commentary for a signal this run just published.
    Never raises: a missing/misconfigured/rate-limited provider just means
    no commentary for this signal, not a failed run. See src/ai/commentary.py.
    """
    try:
        settings = supabase.get_active_ai_settings()
    except Exception as exc:
        print(f"[warn] could not read AI settings ({exc})")
        return
    if not settings:
        print(f"[info] {symbol}/{timeframe}: no active AI provider configured, skipping commentary")
        return

    text = commentary.generate(
        {
            "symbol": symbol,
            "timeframe": timeframe,
            "verdict": result["verdict"],
            "score": result["score"],
            "reasoning": result["reasoning"],
            "patterns": result["patterns"],
            "levels": result["levels"],
            "price": price,
        },
        settings,
    )
    if not text:
        print(f"[warn] {symbol}/{timeframe}: AI commentary generation returned nothing")
        return

    model = (settings.get("config") or {}).get("model") or commentary.DEFAULT_GEMINI_MODEL
    if _mirror(supabase.publish_commentary, symbol, timeframe, candle_time, config.STRATEGY_VERSION, text, model):
        print(f"[info] {symbol}/{timeframe}: AI commentary generated and published ({len(text)} chars, {model})")


def process(instrument, timeframe, now, events=(), engine_settings=None):
    """Evaluate one instrument/timeframe. Returns a status string for logging.

    Every path that declines to publish leaves a suppression record behind, so
    a missing signal is always explainable after the fact (SE-010).

    `events` is the economic calendar for the whole run, fetched once in
    main() rather than once per symbol/timeframe — it does not depend on
    either. Defaults to empty rather than None so a caller that never passes
    it (every existing test, and any instrument with no currency mapped in
    EVENT_RISK_CURRENCY) simply never trips the gate, instead of crashing.

    `engine_settings` is the admin-configured engine_settings row (or None),
    read once per run in main() and threaded straight through to
    engine.evaluate() — see src/storage/supabase.py::get_engine_settings().
    """
    symbol = instrument["symbol"]

    # Only spend a request when the provider could actually have something
    # new. A 1d candle does not change between two polls five minutes apart,
    # and on a free data plan those wasted calls are the binding constraint.
    # Nothing new also means nothing to evaluate: the signal for that candle
    # was published by the run that first saw it.
    newest = newest_stored(symbol, timeframe)
    if newest is not None and newest >= quality.latest_closed_open_time(now, timeframe):
        return f"[current] {symbol}/{timeframe}: latest closed candle already stored"

    # A feed whose newest candle is already stale is usually a closed market
    # rather than a broken one — gold has no weekend candles at all. Asking
    # every poll spends a request to be told the same thing, which on a free
    # data plan exhausts the day's allowance over a weekend. Retry on the
    # half hour instead; a reopening is still noticed well within the hour.
    if newest is not None and quality.is_stale(newest, now, timeframe) and not quality.due_for_stale_retry(now):
        return f"[waiting] {symbol}/{timeframe}: feed stale, holding off until the next retry window"

    try:
        candles = fetch_candles(instrument, timeframe)
    except Exception as exc:
        suppress(symbol, timeframe, now, "FETCH_FAILED", str(exc))
        return f"[skip] {symbol}/{timeframe}: fetch failed ({exc})"

    if not candles:
        suppress(symbol, timeframe, now, "NO_DATA", "provider returned nothing (missing API key?)")
        return f"[skip] {symbol}/{timeframe}: no data (missing API key?)"

    problem = quality.first_invalid(candles)
    if problem:
        suppress(symbol, timeframe, now, "BAD_CANDLE", problem)
        return f"[skip] {symbol}/{timeframe}: rejected feed — {problem}"

    db.upsert_candles(symbol, timeframe, candles)

    recent = db.get_recent_candles(symbol, timeframe, limit=config.CANDLE_FETCH_LIMIT)

    if len(recent) < config.MIN_CANDLES_FOR_SIGNAL:
        detail = f"{len(recent)} closed candles, need {config.MIN_CANDLES_FOR_SIGNAL}"
        suppress(symbol, timeframe, now, "INSUFFICIENT_HISTORY", detail)
        return f"[skip] {symbol}/{timeframe}: {detail}"

    candle_time = recent[-1]["open_time"]
    price = recent[-1]["close"]

    if quality.is_stale(candle_time, now, timeframe):
        age = now - candle_time
        detail = f"newest closed candle opened {age}s ago"
        suppress(symbol, timeframe, now, "STALE_DATA", detail)
        return f"[skip] {symbol}/{timeframe}: stale feed — {detail}"

    # Read-only, never fetched fresh: a higher timeframe's candle usually
    # hasn't changed between two polls anyway, and Twelve Data's gold quota
    # is already sized to fit today's usage exactly (see INSTRUMENTS above)
    # — an extra fetch per lower timeframe would not fit. Supabase's mirror
    # is the only store that reliably outlives a single run (see
    # newest_stored()'s own reasoning), so the anchor read goes through it,
    # not local SQLite, when Supabase is configured.
    anchor_timeframe = confluence.ANCHOR_TIMEFRAME.get(timeframe)
    higher_bias = None
    if anchor_timeframe:
        anchor_candles = (
            supabase.get_recent_candles(symbol, anchor_timeframe, limit=config.CANDLE_FETCH_LIMIT)
            if supabase.is_configured()
            else db.get_recent_candles(symbol, anchor_timeframe, limit=config.CANDLE_FETCH_LIMIT)
        )
        higher_bias = confluence.higher_timeframe_bias(anchor_candles)

    result = engine.evaluate(recent, higher_timeframe_bias=higher_bias, settings=engine_settings)

    currency = config.EVENT_RISK_CURRENCY.get(symbol)
    if currency:
        event = event_risk.blackout(
            events, currency, now, config.EVENT_RISK_BEFORE_MINUTES * 60, config.EVENT_RISK_AFTER_MINUTES * 60
        )
        if event:
            result = engine.apply_event_risk_override(result, recent, event, currency)

    reasoning_text = "; ".join(result["reasoning"])

    signal = {
        "generated_at": now,
        "candle_time": candle_time,
        "price": price,
        "verdict": result["verdict"],
        "score": result["score"],
        "reasoning": reasoning_text,
        "evidence_count": result["evidence_count"],
        "strategy_version": config.STRATEGY_VERSION,
        "confidence": result["confidence"],
        "patterns": ", ".join(result["patterns"]),
        "levels": result["levels"],
        "confluence_bias": higher_bias,
        "regime": result["regime"],
        "market_phase": result["market_phase"],
        "invalidation_level": result["invalidation_level"],
        "entry_zone_low": result["entry_zone_low"],
        "entry_zone_high": result["entry_zone_high"],
    }

    stored = db.record_signal(symbol, timeframe, **signal)

    # Mirrored whether or not SQLite already had it; publishing is idempotent
    # on the Supabase side, so a re-send is a no-op rather than a rewrite.
    #
    # Order matters. newest_stored() reads the mirrored candles to decide
    # there is nothing left to do, so a mirrored candle has to mean the signal
    # for it arrived too. Publishing candles first would let a failed signal
    # publish be skipped over on the next run and lost for good. Publishing
    # them last, and only once the signal is through, makes the next run
    # refetch and try again.
    if _mirror(supabase.publish_signal, symbol, timeframe, **signal):
        _mirror(supabase.publish_candles, symbol, timeframe, candles)
        # Only for a signal this run actually just recorded — publish_signal
        # above is a no-op re-send on every poll that finds nothing new
        # (idempotent on_conflict), and generating commentary on every one
        # of those would burn the AI provider's free-tier quota on the same
        # signal over and over for nothing new to say.
        if stored:
            _generate_commentary(symbol, timeframe, candle_time, price, result)
            if lifecycle.tracks(result):
                _mirror(
                    supabase.publish_lifecycle,
                    symbol,
                    timeframe,
                    candle_time,
                    config.STRATEGY_VERSION,
                    "WAIT",
                    now,
                    now,
                    price,
                    candle_time,
                )

    if not stored:
        return f"[kept] {symbol}/{timeframe}: candle already called, original signal left untouched"

    return f"{symbol}/{timeframe}: {result['verdict']} (score {result['score']:+d}) @ {price} — {reasoning_text}"


def recheck_lifecycles(now, engine_settings=None):
    """Re-evaluates every open (WAIT/WATCH/READY) signal_lifecycle row
    against the latest closed candle for its symbol/timeframe — the one
    piece of this job that revisits something already published, since
    everything else in src/run.py only ever looks at the newest candle
    going forward (see src/signals/lifecycle.py for why signals can't just
    be re-scored in place: it's hard append-only).

    Reads only Supabase's own already-mirrored signals/candles tables —
    never a fresh fetch from Binance/Twelve Data — so this costs zero
    provider-quota requests regardless of how many rows are open.
    `candle_cache` avoids a redundant candles read per row when several
    open rows share the same symbol/timeframe.
    """
    open_rows = supabase.get_open_lifecycle_rows()
    if not open_rows:
        return

    candle_cache = {}
    for row in open_rows:
        key = (row["symbol"], row["timeframe"])
        if key not in candle_cache:
            recent = supabase.get_recent_candles(*key, limit=1)
            candle_cache[key] = recent[-1] if recent else None
        candle = candle_cache[key]
        if candle is None:
            continue

        signal = supabase.get_signal_by_identity(
            row["symbol"], row["timeframe"], row["candle_time"], row["strategy_version"]
        )
        if signal is None:
            continue

        timeframe_seconds = config.TIMEFRAME_SECONDS[row["timeframe"]]
        new_state = lifecycle.next_state(
            row, signal, candle["close"], candle["open_time"], timeframe_seconds, engine_settings
        )
        entered_at = now if new_state != row["state"] else row["entered_at"]

        _mirror(
            supabase.publish_lifecycle,
            row["symbol"],
            row["timeframe"],
            row["candle_time"],
            row["strategy_version"],
            new_state,
            entered_at,
            now,
            candle["close"],
            candle["open_time"],
        )
        if new_state != row["state"]:
            _mirror(
                supabase.publish_lifecycle_transition,
                row["symbol"],
                row["timeframe"],
                row["candle_time"],
                row["strategy_version"],
                row["state"],
                new_state,
                candle["close"],
            )


def detect_alivedestiny_setups(now, alivedestiny_settings=None):
    """Checks each instrument's 15m feed for a fresh Break of Structure and
    starts tracking it as a new alivedestiny_setups row.

    Reads Supabase's own already-mirrored 15m candles — process()'s own
    per-pair loop has already run earlier in this same call to main(), so
    the mirror is as fresh as this run can make it. Creation is idempotent
    by construction: publish_alivedestiny_setup's on_conflict=identity with
    resolution="ignore-duplicates" means re-detecting the same BOS candle
    on a later run (nothing new has closed yet) is a safe no-op, not a
    second row.
    """
    for instrument in config.INSTRUMENTS:
        symbol = instrument["symbol"]
        candles = supabase.get_recent_candles(symbol, ALIVEDESTINY_TIMEFRAME, limit=config.CANDLE_FETCH_LIMIT)
        if len(candles) < config.MIN_CANDLES_FOR_SIGNAL:
            continue

        new_setup = setups.detect_new_setups(candles, alivedestiny_settings)
        if new_setup is None:
            continue

        _mirror(
            supabase.publish_alivedestiny_setup,
            uuid.uuid4().hex,
            symbol,
            ALIVEDESTINY_TIMEFRAME,
            config.ALIVEDESTINY_STRATEGY_VERSION,
            new_setup["bos_candle_time"],
            new_setup["bos_kind"],
            new_setup["bos_direction"],
            new_setup["bos_price"],
            new_setup["break_strength"],
            "BOS_DETECTED",
            now,
            now,
            resolution="ignore-duplicates",
        )


def advance_alivedestiny_setups(now, alivedestiny_settings=None):
    """Re-evaluates every open ALIVEDESTINY setup against the latest
    mirrored candles for its pair — the ALIVEDESTINY analogue of
    recheck_lifecycles(), same "read the mirror back, never fetch fresh"
    shape and the same reasoning for why (process()'s own early-exit gates
    mean there's no in-memory candle data left over from this run's main
    loop to reuse). `candle_cache`/`htf_candle_cache` dedupe reads across
    multiple open setups sharing a pair — unlike signal_lifecycle rows,
    ALIVEDESTINY setups are NOT 1:1 with a pair, so more than one open row
    per (symbol, timeframe) is expected, not a bug.
    """
    open_setups = supabase.get_open_alivedestiny_setups()
    if not open_setups:
        return

    candle_cache = {}
    htf_candle_cache = {}
    for setup in open_setups:
        key = (setup["symbol"], setup["timeframe"])
        if key not in candle_cache:
            candle_cache[key] = supabase.get_recent_candles(*key, limit=config.CANDLE_FETCH_LIMIT)
        candles = candle_cache[key]
        if not candles:
            continue

        if setup["symbol"] not in htf_candle_cache:
            htf_candle_cache[setup["symbol"]] = supabase.get_recent_candles(
                setup["symbol"], ALIVEDESTINY_HTF_TIMEFRAME, limit=config.CANDLE_FETCH_LIMIT
            )
        htf_candles = htf_candle_cache[setup["symbol"]]

        timeframe_seconds = config.TIMEFRAME_SECONDS[setup["timeframe"]]
        result = setups.advance_setup(setup, candles, htf_candles, timeframe_seconds, alivedestiny_settings)
        updated = result["setup"]
        state_changed = updated["state"] != setup["state"]

        _mirror(
            supabase.publish_alivedestiny_setup,
            setup["id"],
            setup["symbol"],
            setup["timeframe"],
            setup["strategy_version"],
            setup["bos_candle_time"],
            updated["bos_kind"],
            updated["bos_direction"],
            updated["bos_price"],
            updated["break_strength"],
            updated["state"],
            now if state_changed else setup["entered_at"],
            now,
            impulse_start_price=updated.get("impulse_start_price"),
            impulse_end_price=updated.get("impulse_end_price"),
            impulse_atr_multiple=updated.get("impulse_atr_multiple"),
            fib_50=updated.get("fib_50"),
            fib_61_8=updated.get("fib_61_8"),
            fib_72=updated.get("fib_72"),
            fib_78_6=updated.get("fib_78_6"),
            invalidation_reason=updated.get("invalidation_reason"),
        )
        if state_changed:
            _mirror(
                supabase.publish_alivedestiny_setup_transition,
                setup["id"], setup["state"], updated["state"], candles[-1]["close"],
            )

        signal = result["signal"]
        if signal is not None:
            _mirror(
                supabase.publish_alivedestiny_signal,
                setup["symbol"],
                setup["timeframe"],
                setup["id"],
                setup["bos_candle_time"],
                now,
                setup["strategy_version"],
                **signal,
            )


def main():
    db.init_db()
    now = int(datetime.now(timezone.utc).timestamp())

    if not supabase.is_configured():
        print("[info] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset — writing local SQLite only")

    # Fetched once for the whole run, not once per symbol/timeframe — the
    # calendar does not depend on either, and every instrument's evaluation
    # is fast enough that ten redundant HTTP calls would be pure waste.
    events = calendar.fetch_events()
    # A quiet feed and a broken parser both look like "no events" to the
    # gate below, and there is no other way to tell them apart from the
    # outside — this line is the difference between the two.
    print(f"[info] economic calendar: {len(events)} events loaded")
    _mirror(supabase.publish_events, events)

    # Read once for the whole run, same reasoning as events above — every
    # process() call gets the same admin-configured thresholds, not a
    # fresh read per symbol/timeframe. None (unconfigured/unreachable)
    # degrades every gate that depends on it to fully inert, reproducing
    # pre-3.0.0 behavior exactly (see engine.evaluate()'s own docstring).
    engine_settings = supabase.get_engine_settings()
    if engine_settings is None:
        print("[info] engine_settings not configured — entry-quality gates run with defaults only")

    for instrument in config.INSTRUMENTS:
        for timeframe in instrument["timeframes"]:
            print(process(instrument, timeframe, now, events=events, engine_settings=engine_settings))

    # After every pair has had a chance to mirror its freshest candle —
    # recheck_lifecycles() reads that mirror back, so it must run last.
    if supabase.is_configured():
        recheck_lifecycles(now, engine_settings)

        # ALIVEDESTINY: a second, independent strategy on the same 15m
        # candles — same "read the mirror back, never fetch fresh" reasoning
        # as recheck_lifecycles(), order-independent relative to it (disjoint
        # tables). Detection must run before advancement, so a setup found
        # this very run gets its first advance-pass evaluation immediately
        # rather than sitting through an idle run first.
        alivedestiny_settings = supabase.get_alivedestiny_settings()
        if alivedestiny_settings is None:
            print("[info] alivedestiny_settings not configured — ALIVEDESTINY gates run with defaults only")
        detect_alivedestiny_setups(now, alivedestiny_settings)
        advance_alivedestiny_setups(now, alivedestiny_settings)


if __name__ == "__main__":
    main()
