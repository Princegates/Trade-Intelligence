import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ASSET_NAMES, ASSET_ORDER } from "@/lib/signal-view";
import { CHART_TIMEFRAMES } from "@/lib/candle-view";

// Pulled from the same constants the dashboard itself renders from, not
// retyped here — an asset or timeframe added to the real system (both have
// grown at least once already) shows up on this page without anyone having
// to remember to update a second copy of the same fact.
const assetList = new Intl.ListFormat(undefined, { style: "long", type: "conjunction" }).format(
  ASSET_ORDER.map((symbol) => ASSET_NAMES[symbol] ?? symbol),
);
const timeframeList = CHART_TIMEFRAMES.join(", ");

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Everything the system actually does today — nothing held back.",
    features: [
      `${assetList} across ${timeframeList}`,
      "Full signal history, not a preview of it",
      "Reasoning shown for every call",
      "Community support",
    ],
    cta: "Create free account",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/mo",
    description: "Reserved for what isn't built yet — nothing here is withheld from Free today.",
    features: ["Everything in Free", "Accuracy / track-record view (coming soon)", "Priority support"],
    cta: "Get notified",
    href: "/about",
    highlighted: true,
  },
  {
    name: "Team",
    price: "Custom",
    period: "",
    description: "Multiple seats and a direct line for feature requests.",
    features: ["Everything in Pro", "Multiple team members", "Custom alert delivery (coming soon)", "Dedicated onboarding"],
    cta: "Contact us",
    href: "/about",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">Simple pricing</h1>
        <p className="mt-3 text-muted-foreground">
          There is no automated billing or paywall yet — every account gets full access today. These tiers describe
          where things are headed as paid features actually ship, not what&apos;s being withheld right now.
        </p>
        <Badge variant="outline" className="mt-4">No card required — nothing is gated yet</Badge>
      </div>

      <p className="mx-auto mt-4 max-w-2xl text-center text-xs text-muted-foreground">
        SignalsVault AI is not financial advice — see the{" "}
        <Link href="/disclaimer" className="underline underline-offset-4 hover:text-foreground">
          full disclaimer
        </Link>
        .
      </p>

      <div className="mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-3">
        {tiers.map((tier) => (
          <Card key={tier.name} className={tier.highlighted ? "border-primary shadow-md" : undefined}>
            <CardHeader>
              {tier.highlighted && <Badge className="mb-2 w-fit">Most popular</Badge>}
              <CardTitle>{tier.name}</CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold">{tier.price}</span>
                <span className="text-sm text-muted-foreground">{tier.period}</span>
              </div>
              <CardDescription>{tier.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full" variant={tier.highlighted ? "default" : "outline"}>
                <Link href={tier.href}>{tier.cta}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
