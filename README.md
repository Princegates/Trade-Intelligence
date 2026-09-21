# Trade Intelligence

A small, personal signal engine for BTC and gold. A GitHub Actions cron job
pulls the latest candles, computes a handful of technical indicators, and
writes a BUY/SELL/HOLD verdict with the reasoning behind it to a SQLite
database committed straight into the repo — no server, no hosting bill.

Every signal is logged with a timestamp so its own track record can be
checked later (`src/accuracy.py`), the same way you'd want to audit any
model that makes calls: never trust a bare verdict, always keep the receipts.

## How it works

```
GitHub Actions (hourly cron)
        │
        ▼
  src/run.py
        │
  ┌─────┴──────┐
  │  ingest    │  Binance REST (BTC, no key) + Twelve Data REST (gold, free key)
  └─────┬──────┘
        ▼
  ┌────────────┐
  │  signals   │  RSI(14), MACD(12,26,9), SMA20/50 crossover → verdict + reasoning
  └─────┬──────┘
        ▼
  ┌────────────┐
  │  storage   │  data/trade_intelligence.db (SQLite, committed by the workflow)
  └────────────┘
```

- **Ingestion** (`src/ingest/`) — Binance's public klines endpoint needs no
  API key. Twelve Data's free tier needs `TWELVEDATA_API_KEY`; without it,
  gold is skipped gracefully rather than failing the whole run.
- **Signal engine** (`src/signals/`) — each indicator votes bullish (+1),
  bearish (-1), or neutral (0); the combined score decides BUY (≥+2), SELL
  (≤-2), or HOLD, and every vote's reasoning is kept, never just the number.
- **Storage** (`src/storage/db.py`) — plain SQLite, two tables: `candles`
  and `signals`. The `.github/workflows/poll.yml` job commits the updated
  `.db` file back to the repo after each run, so history is just `git log`
  on that file.

## Running it locally

```bash
pip install -r requirements.txt
python -m src.run              # fetch candles, compute + store signals
python -m src.cli latest       # latest signal per symbol/timeframe
python -m src.cli history --symbol BTCUSDT --timeframe 1h
python -m src.accuracy --symbol BTCUSDT --timeframe 1h --horizon 5   # score past BUY/SELL calls
```

For gold, set `TWELVEDATA_API_KEY` in your environment (a free Twelve Data
account is enough). BTC works with no key.

## Setting up the cron job

1. Create a free [Twelve Data](https://twelvedata.com/) account and API key.
2. In the repo's Settings → Secrets and variables → Actions, add
   `TWELVEDATA_API_KEY`.
3. That's it — `.github/workflows/poll.yml` runs hourly (`workflow_dispatch`
   also lets you trigger it manually) and commits the updated database.

## What's tracked

| Symbol  | Source     | Timeframes    |
|---------|------------|---------------|
| BTCUSDT | Binance    | 1h, 4h, 1d    |
| XAUUSD  | Twelve Data| 1h, 4h, 1d    |

Edit `src/config.py` to add or remove instruments/timeframes.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

## Roadmap

- Push/Telegram alerts, once the signal logic has a track record worth
  paging yourself over (see `src/accuracy.py`).
- More indicators (Bollinger Bands, ATR) if the current three prove
  insufficient in practice.
