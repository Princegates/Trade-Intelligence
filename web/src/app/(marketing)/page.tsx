import Link from "next/link";
import { ArrowRight, BarChart3, ShieldCheck, Sparkles, Palette, Settings2, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DEMO_SIGNALS } from "@/lib/demo-data";

const features = [
  {
    icon: BarChart3,
    title: "Rule-based signals, not black boxes",
    description: "RSI, MACD, and moving-average crossovers combine into a BUY/SELL/HOLD verdict — every vote is shown, never a bare number.",
  },
  {
    icon: ShieldCheck,
    title: "An auditable track record",
    description: "Every signal is timestamped and scored later against what price actually did, so you can check the system's own accuracy.",
  },
  {
    icon: Sparkles,
    title: "BTC and gold, more assets later",
    description: "Built on the same pipeline for both, with room to add more instruments as the signal engine proves itself.",
  },
  {
    icon: Palette,
    title: "10 themes, day and night",
    description: "Pick a look that fits the way you read charts, and switch between day and night instantly, with no flash on load.",
  },
  {
    icon: Settings2,
    title: "Built for commercialization",
    description: "An admin settings panel with pre-wired slots for email, SMS, payments, and AI providers — ready when you are.",
  },
  {
    icon: Bell,
    title: "Alerts, when the track record earns it",
    description: "Delivery starts simple — dashboard and CLI — with push/SMS/email alerts layered on once the signal logic is trusted.",
  },
];

function verdictVariant(v: string) {
  if (v === "BUY") return "success" as const;
  if (v === "SELL") return "destructive" as const;
  return "secondary" as const;
}

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="outline" className="mb-4">BTC &amp; Gold signal intelligence</Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Trading signals that show their work
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Rule-based BTC and gold signals with the reasoning behind every call, and a track record you can
            audit — not a magic number, not a black box.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/signup">
                Get started <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
          {DEMO_SIGNALS.slice(0, 3).map((s) => (
            <Card key={`${s.symbol}-${s.timeframe}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{s.symbol}</CardTitle>
                  <Badge variant="outline">{s.timeframe}</Badge>
                </div>
                <CardDescription>${s.price.toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant={verdictVariant(s.verdict)} className="mb-2">
                  {s.verdict}
                </Badge>
                <p className="text-xs text-muted-foreground">{s.reasoning[0]}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">Sample data shown — sign up to see live signals.</p>
      </section>

      <section id="features" className="border-t border-border bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">Everything the signal needs to be trusted</h2>
            <p className="mt-3 text-muted-foreground">
              The product philosophy is simple: show the reasoning, keep score, and make the platform pleasant
              to use every day.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title}>
                <CardHeader>
                  <f.icon className="size-8 text-primary" />
                  <CardTitle className="mt-2 text-base">{f.title}</CardTitle>
                  <CardDescription>{f.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Ready to see the reasoning behind every call?</h2>
          <p className="mt-3 text-muted-foreground">Create an account and check the dashboard — no card required to look around.</p>
          <div className="mt-8">
            <Button size="lg" asChild>
              <Link href="/signup">
                Create your account <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
