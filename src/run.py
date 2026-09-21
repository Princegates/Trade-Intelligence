"""Entry point for the scheduled job: pull latest candles, compute signals,
store both. Run with `python -m src.run`."""

from datetime import datetime, timezone

from . import config
from .ingest import binance, twelvedata
from .signals import engine
from .storage import db


def fetch_candles(instrument, timeframe):
    if instrument["provider"] == "binance":
        return binance.fetch_klines(instrument["provider_symbol"], timeframe, limit=config.CANDLE_FETCH_LIMIT)
    if instrument["provider"] == "twelvedata":
        return twelvedata.fetch_klines(instrument["provider_symbol"], timeframe, limit=config.CANDLE_FETCH_LIMIT)
    raise ValueError(f"Unknown provider: {instrument['provider']}")


def main():
    db.init_db()
    generated_at = int(datetime.now(timezone.utc).timestamp())

    for instrument in config.INSTRUMENTS:
        symbol = instrument["symbol"]
        for timeframe in instrument["timeframes"]:
            try:
                candles = fetch_candles(instrument, timeframe)
            except Exception as exc:
                print(f"[skip] {symbol}/{timeframe}: fetch failed ({exc})")
                continue

            if not candles:
                print(f"[skip] {symbol}/{timeframe}: no data (missing API key?)")
                continue

            db.upsert_candles(symbol, timeframe, candles)
            recent = db.get_recent_candles(symbol, timeframe, limit=config.CANDLE_FETCH_LIMIT)
            closes = [c[1] for c in recent]

            if len(closes) < config.MIN_CANDLES_FOR_SIGNAL:
                print(f"[skip] {symbol}/{timeframe}: only {len(closes)} candles, need {config.MIN_CANDLES_FOR_SIGNAL}")
                continue

            result = engine.evaluate(closes)
            candle_time, price = recent[-1]
            reasoning_text = "; ".join(result["reasoning"])

            db.record_signal(
                symbol, timeframe, generated_at, candle_time, price, result["verdict"], result["score"], reasoning_text
            )

            print(f"{symbol}/{timeframe}: {result['verdict']} (score {result['score']:+d}) @ {price} — {reasoning_text}")


if __name__ == "__main__":
    main()
