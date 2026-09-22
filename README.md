# Trade Intelligence

A small, personal signal engine for BTC and gold. A GitHub Actions cron job
pulls the latest candles, computes a handful of technical indicators, and
writes a BUY/SELL/HOLD verdict with the reasoning behind it — no server, no
hosting bill.

Every signal is logged with a timestamp so its own track record can be
checked later (`src/accuracy.py`), the same way you'd want to audit any
model that makes calls: never trust a bare verdict, always keep the receipts.

## How it works

```
Scheduled poll (every 5 minutes)
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
  │  storage   │  SQLite locally; mirrored to Supabase for the dashboard
  └────────────┘
```

- **Ingestion** (`src/ingest/`) — Binance's public klines endpoint needs no
  API key. Twelve Data's free tier needs `TWELVEDATA_API_KEY`; without it,
  gold is skipped gracefully rather than failing the whole run.
- **Signal engine** (`src/signals/`) — each indicator votes bullish (+1),
  bearish (-1), or neutral (0); the combined score decides BUY (≥+1), SELL
  (≤-1), or HOLD, and every vote's reasoning is kept, never just the number.
  Candlestick patterns (`src/signals/patterns.py`) vote as a fourth
  indicator, read against the prevailing trend rather than by name.
- **Quality gates** (`src/quality.py`) — impossible candles and stale feeds
  suppress the signal instead of producing one from bad prices.
- **Storage** (`src/storage/db.py`) — plain SQLite: `candles`, `signals` and
  `signal_suppressions`. Durable history lives in Supabase once configured
  (`src/storage/supabase.py`); the local file is a per-run working copy.

The scheduled job deliberately does **not** commit the database back. It used
to, which gave a `git log` history of every signal — but a 160KB binary
committed every five minutes grew the repository by roughly 1.4GB a month,
because git cannot delta-compress SQLite. The copy in `data/` is a frozen
snapshot, useful as a seed for local runs. Supabase is the durable store, and
the mirror is what a run consults to decide whether there is anything new to
fetch.

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
3. That's it — `.github/workflows/poll.yml` computes signals and mirrors them
   to Supabase. `workflow_dispatch` also lets you trigger it by hand.

## Keeping the feed fresh

**GitHub's `schedule:` will not hold a short interval.** It is best-effort and
gets dropped under load: measured on this repo, a `*/15` cron fired twice in
ten hours against forty expected runs. Short timeframes were stale more often
than not, because nothing was refreshing them.

The workflow therefore also accepts `repository_dispatch`, so an external
scheduler can drive the real cadence while the built-in cron stays as a free
backstop. To set one up:

1. Create a **fine-grained** personal access token (Settings → Developer
   settings → Personal access tokens). Scope it to this repository only, give
   it **Contents: read and write** — the minimum `repository_dispatch`
   accepts — and set an expiry you are willing to rotate on.
2. Point any free scheduler (cron-job.org, UptimeRobot, a Cloudflare Worker
   cron) at this request on whatever interval you want:

```
POST https://api.github.com/repos/<owner>/<repo>/dispatches
Authorization: Bearer <token>
Accept: application/vnd.github+json
Content-Type: application/json

{"event_type": "poll"}
```

A 204 means the run was queued.

The trade-off is that the token lives with a third party, which is why it is
scoped to one repository and one permission: the worst case is someone
triggering your poller or pushing to this repo, not reaching the rest of your
account. Rotate it on the expiry you set.

Pick the interval to match the shortest timeframe in `src/config.py`: a
timeframe goes stale after `STALENESS_INTERVALS` (2) of its own periods, so 5m
candles need a run at least every 10 minutes to stay current, 15m every 30,
and so on. Five minutes keeps every current timeframe fresh.

Polling that often does not cost proportionally more provider requests. A run
only calls a provider when a new candle could actually have closed since the
last one it stored — a daily candle does not change between two polls five
minutes apart, so asking again would spend a request to be told the same
thing. Nothing new to fetch also means nothing new to evaluate: the signal
for that candle was published by the run that first saw it.

Measured over a simulated day of 5-minute polls, gold costs 31 Twelve Data
requests rather than 864: 24 for 1h, 6 for 4h, 1 for 1d. That is what keeps
three gold timeframes inside a free tier of 800 a day.

The exception is a market that is closed. Gold has no weekend candles, so
nothing new ever arrives and each poll retries — roughly 864 requests across
a weekend day, which will exhaust the daily allowance and show gold as
unreachable until it resets. Crypto is unaffected, and gold is genuinely
closed at the time, so the display is not wrong; it is just noisier and more
wasteful than it needs to be. Backing off on a market that is closed would
fix it.

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
   secrets. The scheduled job then mirrors each signal up to Supabase and the
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
