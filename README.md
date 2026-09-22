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
  │  signals   │  EMA stack, RSI+MACD, market structure, candlesticks → verdict + reasoning
  └─────┬──────┘
        ▼
  ┌────────────┐
  │  storage   │  SQLite locally; mirrored to Supabase for the dashboard
  └────────────┘
```

- **Ingestion** (`src/ingest/`) — Binance's public klines endpoint needs no
  API key. Twelve Data's free tier needs `TWELVEDATA_API_KEY`; without it,
  gold is skipped gracefully rather than failing the whole run.
- **Signal engine** (`src/signals/`) — four independent categories each vote
  bullish (+1), bearish (-1) or neutral (0), and a call needs at least two to
  agree (`BUY_THRESHOLD`): an **EMA stack** (9/21/50/100/200 — is price
  riding a bullishly or bearishly aligned line, not just crossing one),
  **momentum** (RSI(14) and MACD(12,26,9) counted *once* between them, since
  both follow the same underlying move — letting them vote separately would
  double-count one opinion as two), **market structure**
  (`src/signals/structure.py` — swing highs/lows, Break of Structure vs.
  Change of Character, ranging vs. trending), and **candlestick patterns**
  (`src/signals/patterns.py`, read against the prevailing trend and only
  counted when the shape actually forms at a swing level — a hammer in the
  middle of nowhere is reported but does not vote). A handful of
  false-signal gates (`src/signals/divergence.py`, an ATR volatility spike,
  a swept liquidity pool, a scheduled high-impact USD release from
  `src/signals/event_risk.py`) can pull a call back to HOLD after the fact,
  but never push a HOLD into one — every gate only ever removes a signal,
  never manufactures one. Every vote's reasoning is kept, never just the
  number. What this deliberately leaves out: DXY, Treasury yields, funding
  rates, open interest, liquidations, and real order-book liquidity — none
  of that is available on the free feeds this project runs
  on, and reporting it anyway would mean inventing data rather than reducing
  confidence when it's missing.
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

## Economic calendar

Gold goes quiet around scheduled high-impact USD releases (NFP, CPI, FOMC,
and the like) — spread widens and price can spike in either direction while
the market digests the number, so a technically sound call issued right
before or after one is a coin flip dressed up as a read. `src/run.py` fetches
the calendar once per run and `src/signals/event_risk.py` pulls a would-be
BUY/SELL back to HOLD if it falls within 30 minutes before or 60 minutes
after a High-impact `USD` event, the same way the ATR-spike and
liquidity-sweep gates already work.

The data comes from `nfs.faireconomy.media` (`src/ingest/calendar.py`) — the
free JSON feed ForexFactory's own embeddable calendar widget runs on, not by
scraping forexfactory.com's pages. ForexFactory has no public API, and
scraping its site directly has historically been against its terms and is
brittle besides; this feed is the redistribution channel it set up for
exactly this kind of reuse. No key, no login, and it costs nothing.

One caveat worth knowing: **BTC is not gated.** This project's BTC-specific
concerns are funding rates, leverage and liquidations, not a scheduled macro
calendar, and there is no free feed for those either — BTC keeps trading
through every release with no override.

A calendar that can't be reached returns no events rather than failing the
run — event risk is context that degrades gracefully, the same as an
unreachable Twelve Data. `src/run.py` prints how many events it loaded each
run (`[info] economic calendar: N events loaded`) so a schema change on the
feed's side — which would otherwise look identical to a quiet week — shows
up as that count dropping to zero.

The calendar is also mirrored to Supabase (`economic_events`,
`web/supabase/migrations/0008_calendar.sql`) and shown on the dashboard: the
next 7 days of events, with forecast/previous/actual where the feed has
them, and — for each High-impact release that gates something — exactly
which instrument and exact window it holds, in the engine's own words. The
card never claims a direction; it only states what the system is actually
doing and why.

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

Measured over a simulated trading day of 5-minute polls, gold costs 415
Twelve Data requests rather than the 1440 an unconditional poller would
spend: 288 for 5m, 96 for 15m, 24 for 1h, 6 for 4h and 1 for 1d. Each
timeframe costs only its own candle rate, which is what lets all five fit
inside a free tier of 800 a day.

A closed market is handled separately. Gold has no weekend candles, so
nothing new ever arrives and an unthrottled poller would keep asking — 1440
requests across a Saturday, nearly twice the day's allowance, leaving gold
unreachable until it reset. A feed already known to be stale is therefore
retried only in the opening window of each half hour, and still notices the
market reopening within thirty minutes.

Simulated against the real gates, that puts a Saturday at 704 requests and a
longer closure at 480 a day. The peak is the first closed day rather than the
quietest: a daily candle is not yet two days overdue, so it has not tripped
the staleness test and is still asking on every poll. 704 is the number with
the least headroom under the 800 cap, and the one to re-check before adding
another gold timeframe.

The throttle is derived from the clock rather than from stored state, so it
needs no bookkeeping and behaves identically on an ephemeral runner. It
applies only to feeds that are already stale; a live market is never held
off.

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

| Symbol  | Source      | Timeframes          |
|---------|-------------|---------------------|
| BTCUSDT | Binance     | 5m, 15m, 1h, 4h, 1d |
| XAUUSD  | Twelve Data | 5m, 15m, 1h, 4h, 1d |

Edit `src/config.py` to add or remove instruments/timeframes.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

## Roadmap

- Push/Telegram alerts, once the signal logic has a track record worth
  paging yourself over (see `src/accuracy.py`).
- Re-derive `BUY_THRESHOLD` from a real backtest once the confluence engine
  has accumulated a comparable volume of resolved signals to the one that
  justified the old per-indicator threshold — it is currently a considered
  default, not a measured one (see the comment in `src/config.py`).
- Feed the higher-timeframe read into a lower timeframe's own evaluation, so
  "never let a 5-minute move override an established daily trend" is
  enforced inside the engine itself rather than only at the dashboard's
  consensus tile (`web/src/lib/consensus.ts`), which already weights longer
  timeframes more heavily and requires cross-timeframe agreement.
- Anything needing data this project doesn't have for free — DXY, Treasury
  yields, funding rates, open interest, liquidations, real order-book
  liquidity, spread — stays out of scope until there's a free source for
  it, rather than approximated or invented. The macro/event calendar is no
  longer on this list (see "Economic calendar" above).
