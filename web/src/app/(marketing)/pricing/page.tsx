import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Look around and see how the signal engine reasons.",
    features: ["Latest signal per symbol/timeframe", "Reasoning shown for every call", "Community support"],
    cta: "Create free account",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/mo",
    description: "For active traders who want full history and accuracy tracking.",
    features: ["Everything in Free", "Full signal history", "Accuracy / track-record view", "Priority support"],
    cta: "Contact us to subscribe",
    href: "/about",
    highlighted: true,
  },
  {
    name: "Team",
    price: "Custom",
    period: "",
    description: "Multiple seats and a direct line for feature requests.",
    features: ["Everything in Pro", "Multiple team members", "Custom alert delivery", "Dedicated onboarding"],
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
          Billing is handled manually for now while the signal engine builds its track record — reach out and
          we&apos;ll get you set up.
        </p>
        <Badge variant="outline" className="mt-4">No card required for Free</Badge>
      </div>

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
