"""Entry point for the scheduled job: pull latest candles, compute signals,
store both. Run with `python -m src.run`."""

from datetime import datetime, timezone

from . import config, quality
from .ingest import binance, calendar, twelvedata
from .signals import engine, event_risk
from .storage import db, supabase


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


def process(instrument, timeframe, now, events=()):
    """Evaluate one instrument/timeframe. Returns a status string for logging.

    Every path that declines to publish leaves a suppression record behind, so
    a missing signal is always explainable after the fact (SE-010).

    `events` is the economic calendar for the whole run, fetched once in
    main() rather than once per symbol/timeframe — it does not depend on
    either. Defaults to empty rather than None so a caller that never passes
    it (every existing test, and any instrument with no currency mapped in
    EVENT_RISK_CURRENCY) simply never trips the gate, instead of crashing.
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

    result = engine.evaluate(recent)

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

    if not stored:
        return f"[kept] {symbol}/{timeframe}: candle already called, original signal left untouched"

    return f"{symbol}/{timeframe}: {result['verdict']} (score {result['score']:+d}) @ {price} — {reasoning_text}"


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

    for instrument in config.INSTRUMENTS:
        for timeframe in instrument["timeframes"]:
            print(process(instrument, timeframe, now, events=events))


if __name__ == "__main__":
    main()
