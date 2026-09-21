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
- **Quality gates** (`src/quality.py`) — impossible candles and stale feeds
  suppress the signal instead of producing one from bad prices.
- **Storage** (`src/storage/db.py`) — plain SQLite: `candles`, `signals` and
  `signal_suppressions`. The `.github/workflows/poll.yml` job commits the
  updated `.db` file back to the repo after each run, so history is just
  `git log` on that file.

## Signal integrity

The engine is deliberately conservative about what it is willing to publish:

- **Closed candles only.** Both feeds return the candle that is still
  forming; it is stored but excluded from indicator input, so a verdict can
  never change as the bar moves (no repainting).
- **Published signals are never rewritten.** Re-running over a candle that
  was already called leaves the original untouched. A change in the scoring
  logic means bumping `STRATEGY_VERSION`, which publishes a *new* signal
  alongside the old one rather than editing history.
- **Every signal records its lineage** — price, score, evidence count and the
  strategy version that produced it, so a past call can be reproduced.
- **Silence is explainable.** A missing signal always has a row in
  `signal_suppressions` giving the reason: `FETCH_FAILED`, `NO_DATA`,
  `BAD_CANDLE`, `INSUFFICIENT_HISTORY` or `STALE_DATA`.
- **Confidence is not reported yet.** A percentage derived from the score
  would only restate how many indicators agreed, which is not the same as how
  often that agreement has been right. It stays empty until `src/accuracy.py`
  has enough resolved signals to calibrate it against.

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

## The web dashboard

`web/` is a Next.js app that reads the same signals. It runs fully browsable
on sample data until a Supabase project is configured, and says so on screen —
sample prices are never presented as live ones.

To connect it to the engine:

1. Create a free [Supabase](https://supabase.com/) project and run the files
   in `web/supabase/migrations/` in order from the SQL editor.
2. Copy `web/.env.example` to `web/.env.local` and fill in the project URL and
   anon key.
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the repo's Actions
   secrets. The hourly job then mirrors each signal up to Supabase and the
   dashboard shows real calls instead of samples.

The mirror is optional and best-effort: SQLite stays the source of truth, so
an unreachable Supabase degrades to a local-only run rather than failing it.

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
