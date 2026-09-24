import { LineChart } from "lucide-react";
import { cn } from "@/lib/utils";

/** The one wordmark used everywhere the logo appears (navbar, dashboard
 * sidebar, auth pages) — "Trade Intelligence" lives on as the tagline under
 * the SignalsVault AI name rather than disappearing outright. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LineChart className="size-5 shrink-0 text-primary" />
      <span className="flex flex-col leading-none">
        <span className="font-semibold">SignalsVault AI</span>
        <span className="text-[10px] font-normal text-muted-foreground">Trade Intelligence</span>
      </span>
    </span>
  );
}
