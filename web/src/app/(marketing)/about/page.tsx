import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <h1 className="text-4xl font-bold tracking-tight">About Trade Intelligence</h1>
      <p className="mt-4 text-muted-foreground">
        Trade Intelligence started as a small, personal signal engine for BTC and gold: a scheduled job that
        pulls the latest candles, computes a handful of technical indicators, and writes a verdict with the
        reasoning behind it. This site is that same philosophy, built into a product — never a bare number,
        always the reasoning, and a track record you can check.
      </p>

      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What it does</CardTitle>
            <CardDescription>
              An EMA stack, momentum (RSI+MACD), market structure, and candlestick confirmation each vote
              bullish, bearish, or neutral — and at least two have to agree before it calls a direction at
              all. Every vote&apos;s reasoning is kept, not just the number, and a handful of false-signal
              checks can pull a call back to wait-and-see, never the other way around.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What it doesn&apos;t do</CardTitle>
            <CardDescription>
              It isn&apos;t financial advice, and it doesn&apos;t place trades for you. It&apos;s a second
              opinion with its reasoning shown, and a record of how that opinion has performed.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="mt-12">
        <h2 className="text-2xl font-semibold">Get in touch</h2>
        <p className="mt-3 text-muted-foreground">
          For Pro/Team plans, feature requests, or anything else, reach out at{" "}
          <a href="mailto:hello@tradeintel.app" className="text-primary underline underline-offset-4">
            hello@tradeintel.app
          </a>
          .
        </p>
      </div>
    </div>
  );
}
