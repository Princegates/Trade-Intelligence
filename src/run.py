"""Entry point for the scheduled job: pull latest candles, compute signals,
store both. Run with `python -m src.run`."""

from datetime import datetime, timezone

from . import config, quality
from .ingest import binance, twelvedata
from .signals import engine
from .storage import db, supabase


def _mirror(publish, *args, **kwargs):
    """Push a record to Supabase. SQLite already holds it, so a mirror failure
    is reported and shrugged off rather than losing the run (NFR-013)."""
    try:
        publish(*args, **kwargs)
    except Exception as exc:
        print(f"[warn] not mirrored to Supabase ({exc})")


def fetch_candles(instrument, timeframe):
    if instrument["provider"] == "binance":
        return binance.fetch_klines(instrument["provider_symbol"], timeframe, limit=config.CANDLE_FETCH_LIMIT)
    if instrument["provider"] == "twelvedata":
        return twelvedata.fetch_klines(instrument["provider_symbol"], timeframe, limit=config.CANDLE_FETCH_LIMIT)
    raise ValueError(f"Unknown provider: {instrument['provider']}")


def suppress(symbol, timeframe, now, reason, detail):
    db.record_suppression(symbol, timeframe, now, reason, detail)
    _mirror(supabase.publish_suppression, symbol, timeframe, now, reason, detail)


def process(instrument, timeframe, now):
    """Evaluate one instrument/timeframe. Returns a status string for logging.

    Every path that declines to publish leaves a suppression record behind, so
    a missing signal is always explainable after the fact (SE-010).
    """
    symbol = instrument["symbol"]

    # Only spend a request when the provider could actually have something
    # new. A 1d candle does not change between two polls five minutes apart,
    # and on a free data plan those wasted calls are the binding constraint.
    # Evaluation below still runs either way, from candles already stored.
    newest = db.newest_complete_candle(symbol, timeframe)
    if newest is None or newest < quality.latest_closed_open_time(now, timeframe):
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

    candle_time, price = recent[-1]

    if quality.is_stale(candle_time, now, timeframe):
        age = now - candle_time
        detail = f"newest closed candle opened {age}s ago"
        suppress(symbol, timeframe, now, "STALE_DATA", detail)
        return f"[skip] {symbol}/{timeframe}: stale feed — {detail}"

    result = engine.evaluate([c[1] for c in recent])
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
    }

    stored = db.record_signal(symbol, timeframe, **signal)

    # Mirrored even when SQLite already had it. Signals computed before
    # Supabase was configured would otherwise stay stranded locally forever,
    # since the local insert reports "already called" and nothing would ever
    # carry them up. Publishing is idempotent on the Supabase side too, so a
    # re-send is a no-op rather than a rewrite.
    _mirror(supabase.publish_signal, symbol, timeframe, **signal)

    if not stored:
        return f"[kept] {symbol}/{timeframe}: candle already called, original signal left untouched"

    return f"{symbol}/{timeframe}: {result['verdict']} (score {result['score']:+d}) @ {price} — {reasoning_text}"


def main():
    db.init_db()
    now = int(datetime.now(timezone.utc).timestamp())

    if not supabase.is_configured():
        print("[info] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset — writing local SQLite only")

    for instrument in config.INSTRUMENTS:
        for timeframe in instrument["timeframes"]:
            print(process(instrument, timeframe, now))


if __name__ == "__main__":
    main()
