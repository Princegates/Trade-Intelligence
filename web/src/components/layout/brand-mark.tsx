import { LineChart } from "lucide-react";
import { cn } from "@/lib/utils";

/** The one wordmark used everywhere the logo appears (navbar, dashboard
 * sidebar, auth pages) — just the name, no tagline. The "Market
 * Intelligence" kicker now lives above the hero badge on the marketing
 * homepage instead (see (marketing)/page.tsx). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LineChart className="size-5 shrink-0 text-primary" />
      <span className="font-semibold leading-none">SignalsVault AI</span>
    </span>
  );
}
