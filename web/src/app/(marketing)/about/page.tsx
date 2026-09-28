import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CandlestickChart,
  Check,
  ChevronDown,
  Eye,
  Hand,
  History,
  Layers,
  Mail,
  MessageCircle,
  Newspaper,
  Scale,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ASSET_NAMES, ASSET_ORDER } from "@/lib/signal-view";
import { CHART_TIMEFRAMES } from "@/lib/candle-view";
import { getAccessPolicy } from "@/lib/access-policy";
import { getGudaSpecialSettings } from "@/lib/guda-special-settings";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "How SignalsVault AI turns Bitcoin and gold price data into BUY, SELL or HOLD calls: the four checks that vote, the safety checks that can stop a call, what every signal shows, how results are measured, and how access works.",
  alternates: { canonical: `${SITE_URL}/about` },
};

// The trial length changes without a deploy, and the GUDA
// SPECIAL section follows the admin's on/off switch — same reason the
// homepage and pricing page render per request.
export const dynamic = "force-dynamic";

// From the same constants the dashboard renders from, like the pricing page,
// so a new asset or timeframe shows up here without a second copy to update.
const assetNames = ASSET_ORDER.map((symbol) => ASSET_NAMES[symbol] ?? symbol);
const assetList = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(assetNames);
const timeframeList = CHART_TIMEFRAMES.join(", ");

const principles = [
  {
    icon: Eye,
    title: "Show the reasoning",
    body: "Every call lists the evidence behind it in plain English, so you can agree, disagree, or learn from it. No bare numbers.",
  },
  {
    icon: Scale,
    title: "Keep score honestly",
    body: "Every call is followed as a real trade until it hits its stop or target, with fees taken off. Nothing is quietly counted as a win.",
  },
  {
    icon: Hand,
    title: "Stand aside when it's unclear",
    body: "HOLD is a real answer. When the evidence is thin or the market is risky, the engine says so instead of forcing a trade.",
  },
];

// Mirrors src/signals/engine.py::evaluate — the four voting categories and
// the rule that turns their votes into a direction.
const steps = [
  {
    title: "Read the latest closed candles",
    body: "Every few minutes the engine pulls fresh price data for each market and timeframe. It only uses candles that have finished forming, and skips any feed that's stale, missing or sends an impossible candle.",
  },
  {
    title: "Four independent checks vote",
    body: "Trend (a stack of moving averages), momentum (RSI and MACD together), market structure (swing highs and lows and where they break), and candlestick confirmation each vote bullish, bearish or neutral, with their reasons.",
  },
  {
    title: "The votes have to clearly agree",
    body: "Bullish votes must outnumber bearish ones by at least two for a BUY (and the reverse for a SELL). Anything less is HOLD. So is having too little history to judge.",
  },
  {
    title: "Safety checks get a veto",
    body: "A set of false-signal checks, listed below, can turn a BUY or SELL back into HOLD. They can never do the opposite: evidence has to earn a call, and a check can only take one away.",
  },
  {
    title: "Publish the call with its levels",
    body: "A surviving call is published with an entry zone, stop, target and invalidation level taken from real support and resistance where it exists, plus a confidence score and the full reasoning.",
  },
];

const vetoes = [
  { title: "Sideways market", body: "Structure is ranging rather than trending, so there's no clear direction to trade." },
  { title: "Abnormal volatility", body: "A candle blew far past its normal range. Levels sized on normal conditions wouldn't hold." },
  {
    title: "Likely false breakout",
    body: "Price swept past a cluster of highs or lows and closed straight back inside, a classic trap.",
  },
  { title: "Momentum disagrees", body: "RSI or MACD is diverging from price in the opposite direction to the call." },
  {
    title: "Bigger picture disagrees",
    body: "Each timeframe checks a higher one (5m checks 1h, 15m checks 4h, 1h and 4h check the daily). If that trend opposes the call, it's held.",
  },
  {
    title: "Major economic news",
    body: "Gold calls pause from 30 minutes before to 60 minutes after a scheduled high-impact US release, when spreads and whipsaws spike.",
  },
  { title: "Price already ran away", body: "Price is too far from its entry zone. Chasing it would mean a poor entry." },
  {
    title: "Not enough reward, or confidence",
    body: "The target isn't far enough beyond the stop, or the confidence score falls below the engine's minimum.",
  },
];

// src/signals/engine.py::_confidence — eight categories summing to 100.
const confidenceParts = [
  { label: "Agreement with the higher timeframe", points: 20 },
  { label: "Market structure", points: 20 },
  { label: "Quality of the pullback into the entry zone", points: 15 },
  { label: "Nearby support or resistance", points: 10 },
  { label: "Candlestick confirmation", points: 10 },
  { label: "Volatility in a normal range", points: 10 },
  { label: "Momentum", points: 10 },
  { label: "Liquidity (no trap against the call)", points: 5 },
];

const signalAnatomy = [
  { term: "Verdict", body: "BUY, SELL or HOLD, per market and timeframe." },
  { term: "Reasoning", body: "Every vote and every check that fired, written out in plain English." },
  {
    term: "Levels",
    body: "Entry zone, stop, target and invalidation level, so you know exactly where the idea is wrong.",
  },
  { term: "Confidence", body: "A 0–100 checklist score with its breakdown (see below)." },
  {
    term: "Status",
    body: "Where the call is right now: Wait, Watch, Ready, then Confirmed, or Invalidated or Expired if it didn't play out.",
  },
  {
    term: "Market phase",
    body: "What the market is doing right now: an impulse move, a pullback, a breakout, consolidation or a reversal.",
  },
];

const dashboardFeatures = [
  {
    icon: Layers,
    title: "Consensus across timeframes",
    body: "One tile per market that sums up what every timeframe is saying, so conflicting signals are obvious at a glance.",
  },
  { icon: CandlestickChart, title: "Price charts", body: `Candlestick charts for ${timeframeList} alongside each call.` },
  {
    icon: CalendarDays,
    title: "Economic calendar",
    body: "Upcoming high-impact releases, the same events the engine stands aside for.",
  },
  { icon: Newspaper, title: "Market news", body: "Recent Bitcoin and gold headlines next to the calendar." },
  {
    icon: Sparkles,
    title: "AI take",
    body: "A short commentary written by a language model on top of each call. It adds colour and never changes the verdict.",
  },
  {
    icon: MessageCircle,
    title: "Guda, the assistant",
    body: "Ask questions about your signals, or trading in general, in plain language (full access).",
  },
  {
    icon: History,
    title: "Signal history",
    body: "Past calls for every market and timeframe, with filters, so you can check the record yourself (full access).",
  },
  {
    icon: Activity,
    title: "Feed health",
    body: "If a data feed is down or stale, the dashboard says so instead of showing an old call as if it were current.",
  },
];

const fitsWell = [
  "You want a second opinion on Bitcoin or gold, with the reasons shown",
  "You're learning technical analysis and want to see it applied step by step",
  "You'd rather judge a system by how its calls actually play out",
  "You trade manually and want clear entry, stop and target levels to plan around",
];

const notAFit = [
  "You want trades placed for you automatically. It never touches your account",
  "You're looking for guaranteed returns. No signal service can honestly offer them",
  "You need personal financial advice. This is general market analysis",
];

export default async function AboutPage() {
  const [{ trialDays }, { enabled: gudaSpecialEnabled }] = await Promise.all([
    getAccessPolicy(),
    getGudaSpecialSettings(),
  ]);

  const trialLength = `${trialDays} day${trialDays === 1 ? "" : "s"}`;

  const faqs = [
    {
      q: "Does it place trades for me?",
      a: "No. SignalsVault AI never connects to a brokerage or exchange account. It publishes analysis. What you do with it, and on which platform, is entirely up to you.",
    },
    {
      q: "Is it AI making the calls?",
      a: "No. Every BUY, SELL and HOLD comes from fixed, rule-based technical analysis, so the same prices always produce the same call and every call can be explained. AI is used only for the optional commentary on each card and for the Guda chat assistant, and neither can change a verdict.",
    },
    {
      q: "How often do signals update?",
      a: `The engine checks every few minutes, but a signal only changes when a candle on its timeframe closes. A 5-minute signal can update many times an hour; a daily signal changes at most once a day. Timeframes covered: ${timeframeList}.`,
    },
    {
      q: "Why do I see so many HOLDs?",
      a: "On purpose. A call needs clear agreement and has to pass every safety check. Most of the time markets don't offer a clean setup, and saying so is more useful than a forced trade.",
    },
    {
      q: "How accurate is it?",
      a: "Every call is scored as a real trade, as described above. Live results under this method are still building up, so no accuracy figure is published yet. Past results never guarantee future ones.",
    },
    {
      q: "Which markets do you cover?",
      a: `${assetList} today, each across ${CHART_TIMEFRAMES.length} timeframes. More instruments are planned once the engine has proven itself on these.`,
    },
    {
      q: "Why does my account need approval?",
      a: `Every sign-up is reviewed by an admin before the free trial starts. Once approved, you get ${trialLength} of full access, with no card and no automatic billing.`,
    },
  ];

  return (
    <div>
      <section className="mx-auto max-w-4xl px-4 pb-12 pt-20 text-center sm:px-6 sm:pt-24">
        <Badge variant="outline" className="mb-4">
          About {SITE_NAME}
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Trading signals you can check, not just trust</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          {SITE_NAME} watches {assetList} and publishes BUY, SELL or HOLD calls across five
          timeframes. Every call comes with the reasoning behind it and clear risk levels, and is followed as a real
          trade, so you can decide for yourself whether it deserves your attention.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/signup">
              Start your free trial <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>

        <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-left sm:grid-cols-4">
          {[
            { value: String(assetNames.length), label: `markets: ${assetList}` },
            { value: String(CHART_TIMEFRAMES.length), label: `timeframes, ${CHART_TIMEFRAMES[0]} to ${CHART_TIMEFRAMES.at(-1)}` },
            { value: gudaSpecialEnabled ? "2" : "1", label: gudaSpecialEnabled ? "independent strategies" : "rule-based strategy" },
            { value: "Minutes", label: "between checks, on closed candles only" },
          ].map((stat) => (
            <div key={stat.label} className="bg-card p-4">
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="block text-2xl font-bold tracking-tight">{stat.value}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{stat.label}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">Why it exists</h2>
            <p className="mt-3 text-muted-foreground">
              Most signal services hand you an arrow and a price, with no reasons and no record of how past calls
              did. {SITE_NAME} started as a personal trade-intelligence engine built to fix that, and it runs on three
              rules.
            </p>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {principles.map((p) => (
              <Card key={p.title}>
                <CardHeader>
                  <p.icon className="size-7 text-primary" />
                  <CardTitle className="mt-2 text-base">{p.title}</CardTitle>
                  <CardDescription>{p.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">It&apos;s a good fit if…</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {fitsWell.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">It&apos;s not for you if…</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {notAFit.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-t border-border py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">How a signal is made</h2>
          <p className="mt-3 text-muted-foreground">
            The same five steps run for every market and every timeframe. The rules are fixed, so identical prices
            always produce the identical call, and every published call records the engine version that made it.
          </p>
          <ol className="mt-10 space-y-8">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-sm font-semibold text-primary">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="safety-checks" className="scroll-mt-20 border-t border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">The checks that can stop a call</h2>
            <p className="mt-3 text-muted-foreground">
              These exist to catch the setups that look good on one indicator and fail in practice. When one fires,
              the call becomes HOLD and the reasoning names the check, so you always know why.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {vetoes.map((v) => (
              <Card key={v.title}>
                <CardHeader className="p-5">
                  <CardTitle className="text-sm">{v.title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{v.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="signal" className="scroll-mt-20 py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">What every signal shows you</h2>
              <p className="mt-3 text-muted-foreground">
                A signal is a complete trade plan with its reasoning, not an alert you have to take on faith.
              </p>
              <dl className="mt-8 space-y-5">
                {signalAnatomy.map((item) => (
                  <div key={item.term}>
                    <dt className="text-sm font-semibold">{item.term}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <Card className="self-start">
              <CardHeader>
                <CardTitle className="text-base">How the confidence score adds up</CardTitle>
                <CardDescription>
                  Eight parts, 100 points in total. It&apos;s a checklist of how many things line up, not a
                  probability of winning, and each card lists its own breakdown in the reasoning.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {confidenceParts.map((part) => (
                    <li key={part.label}>
                      <div className="flex items-baseline justify-between gap-4 text-sm">
                        <span>{part.label}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{part.points} pts</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${part.points * 5}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {gudaSpecialEnabled && (
        <section id="strategies" className="scroll-mt-20 border-t border-border bg-muted/30 py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight">Two strategies, side by side</h2>
              <p className="mt-3 text-muted-foreground">
                They run independently and are never blended into one number, so when both agree, that&apos;s two
                separate methods reaching the same view.
              </p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <Badge variant="outline" className="mb-2 w-fit">
                    Every timeframe
                  </Badge>
                  <CardTitle className="text-base">Confluence engine</CardTitle>
                  <CardDescription className="leading-relaxed">
                    The main engine described above: four checks vote, the safety checks can veto, and every market
                    gets a call on each of the {CHART_TIMEFRAMES.length} timeframes. Best for reading the overall
                    picture and how the timeframes line up.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <Badge variant="outline" className="mb-2 w-fit">
                    15-minute chart
                  </Badge>
                  <CardTitle className="text-base">GUDA SPECIAL</CardTitle>
                  <CardDescription className="leading-relaxed">
                    A patient break-and-retest strategy. It waits for price to break a key level with a strong move,
                    pull back into the 50–78.6% Fibonacci zone of that move, and print a clear confirming candle,
                    then checks the 1-hour trend and demands enough room to the next obstacle before calling a trade.
                    Setups take hours to form, so its card is quieter by design.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-border py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">Everything else on the dashboard</h2>
            <p className="mt-3 text-muted-foreground">
              The context you&apos;d otherwise gather from five different tabs, next to the calls themselves.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {dashboardFeatures.map((f) => (
              <Card key={f.title}>
                <CardHeader className="p-5">
                  <f.icon className="size-6 text-primary" />
                  <CardTitle className="mt-2 text-sm">{f.title}</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">{f.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="results" className="scroll-mt-20 border-t border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">How results are measured</h2>
          <div className="mt-6 space-y-4 text-muted-foreground">
            <p>
              Every BUY or SELL is followed as a trade, candle by candle, the way a trader would actually have
              experienced it:
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "Entry at the close of the candle that made the call.",
                "Every later candle is checked by its high and low, so a wick through the stop counts as a loss.",
                "If a candle touches both the stop and the target, it counts as the stop.",
                "Fees and slippage are taken off every trade.",
                "One trade at a time per market and timeframe, so one move is never counted twice.",
              ].map((rule) => (
                <li key={rule} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
            <p>
              Results are recorded in R, multiples of the amount risked: +1R won as much as the stop would have lost.
              No figure is shown here yet: there isn&apos;t enough live history under this method to be meaningful.
            </p>
          </div>
        </div>
      </section>

      <section id="access" className="scroll-mt-20 border-t border-border py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">How access works</h2>
            <p className="mt-3 text-muted-foreground">No card, no subscription and no automatic billing.</p>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                title: "Sign up",
                body: "Create an account with your email. An admin reviews each new sign-up before the trial starts.",
              },
              {
                title: `Free trial: ${trialLength} of full access`,
                body: "Once approved, you see everything: full reasoning, levels, history, and the Guda assistant.",
              },
              {
                title: "Renew with an access code",
                body: "After the trial you keep basic view (the latest call per timeframe, with details locked) until an admin sends a code that renews full access.",
              },
            ].map((step, i) => (
              <li key={step.title}>
                <Card className="h-full">
                  <CardHeader>
                    <span className="text-xs font-semibold uppercase tracking-wide text-primary">Step {i + 1}</span>
                    <CardTitle className="text-base">{step.title}</CardTitle>
                    <CardDescription>{step.body}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Full details on the{" "}
            <Link href="/pricing" className="text-primary underline underline-offset-4">
              pricing page
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="text-base">What it is, and what it isn&apos;t</CardTitle>
              <CardDescription className="leading-relaxed">
                {SITE_NAME} is an analysis tool: a rule-based second opinion with its reasoning shown and its record
                kept. It isn&apos;t financial advice and doesn&apos;t place trades. Bitcoin and gold can move sharply,
                every signal can be wrong, and past results don&apos;t guarantee future ones. Only trade with money
                you can afford to lose, and read the{" "}
                <Link href="/disclaimer" className="underline underline-offset-4 hover:text-foreground">
                  full disclaimer
                </Link>
                .
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 border-t border-border py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Questions people ask</h2>
          <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
            {faqs.map((faq) => (
              <details key={faq.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">See it for yourself</h2>
          <p className="mt-3 text-muted-foreground">
            The quickest way to judge it is to watch a few calls play out. The trial is free and needs no card.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/signup">
                Create your account <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Mail className="size-4" />
            Questions, access requests or feature ideas:
            <a href="mailto:info@anknovate.com" className="text-primary underline underline-offset-4">
              info@anknovate.com
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
