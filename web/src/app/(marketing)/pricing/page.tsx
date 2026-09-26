import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ASSET_NAMES, ASSET_ORDER } from "@/lib/signal-view";
import { CHART_TIMEFRAMES } from "@/lib/candle-view";
import { getAccessPolicy } from "@/lib/access-policy";

// Pulled from the same constants the dashboard itself renders from, not
// retyped here — an asset or timeframe added to the real system (both have
// grown at least once already) shows up on this page without anyone having
// to remember to update a second copy of the same fact.
const assetList = new Intl.ListFormat(undefined, { style: "long", type: "conjunction" }).format(
  ASSET_ORDER.map((symbol) => ASSET_NAMES[symbol] ?? symbol),
);
const timeframeList = CHART_TIMEFRAMES.join(", ");

// trialDays is admin-configurable and can change at any time — must never be
// baked into a build-time static render, same rule as the homepage's live
// signal data (see (marketing)/page.tsx).
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const { trialDays } = await getAccessPolicy();

  const tiers = [
    {
      name: "Free trial",
      price: "$0",
      period: "",
      description: "Every account starts here. Once an admin approves your sign-up, you get full access to try it.",
      features: [
        `${assetList} across ${timeframeList}`,
        `Full signal history and reasoning for ${trialDays} day${trialDays === 1 ? "" : "s"}`,
        "Requires admin approval after signup",
      ],
      cta: "Create free account",
      href: "/signup",
      highlighted: false,
    },
    {
      name: "Full access",
      price: "By request",
      period: "",
      description:
        "After the trial ends, you drop to the latest signal only until an admin sends you a renewal code — there's no self-serve payment yet.",
      features: [
        "Everything in the free trial",
        "Full signal history & reasoning, renewed via an access code",
        "Renewed manually — no card, no subscription",
      ],
      cta: "Request access",
      href: "mailto:hello@signalsvaultai.com",
      highlighted: true,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">Simple pricing</h1>
        <p className="mt-3 text-muted-foreground">
          There&apos;s no automated billing yet — access is granted directly by an admin. Every account gets a free
          trial, then drops to the latest signal only until it&apos;s renewed.
        </p>
        <Badge variant="outline" className="mt-4">No card required — access is admin-granted</Badge>
      </div>

      <p className="mx-auto mt-4 max-w-2xl text-center text-xs text-muted-foreground">
        SignalsVault AI is not financial advice — see the{" "}
        <Link href="/disclaimer" className="underline underline-offset-4 hover:text-foreground">
          full disclaimer
        </Link>
        .
      </p>

      <div className="mx-auto mt-14 grid max-w-3xl gap-6 sm:grid-cols-2">
        {tiers.map((tier) => (
          <Card key={tier.name} className={tier.highlighted ? "border-primary shadow-md" : undefined}>
            <CardHeader>
              {tier.highlighted && <Badge className="mb-2 w-fit">Next step</Badge>}
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
