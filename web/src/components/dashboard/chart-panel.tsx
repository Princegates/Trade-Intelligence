"use client";

import { useState } from "react";

import { PriceChart, type ChartLevel } from "@/components/dashboard/price-chart";
import { CHART_TIMEFRAMES, type Candle } from "@/lib/candle-view";

/** The chart plus its timeframe picker.
 *
 * Every timeframe's candles arrive together, so switching is instant. The
 * levels stay on screen whichever is chosen — they are prices, and a daily
 * stop is just as real on a 5m chart, often more informative there. */
export function ChartPanel({
  candlesByTimeframe,
  levels,
  initialTimeframe,
}: {
  candlesByTimeframe: Record<string, Candle[]>;
  levels: ChartLevel[];
  initialTimeframe?: string;
}) {
  const available = CHART_TIMEFRAMES.filter((tf) => (candlesByTimeframe[tf]?.length ?? 0) > 0);
  const [timeframe, setTimeframe] = useState(
    initialTimeframe && available.includes(initialTimeframe as (typeof CHART_TIMEFRAMES)[number])
      ? initialTimeframe
      : (available.at(-1) ?? ""),
  );

  if (available.length === 0) return null;

  const candles = candlesByTimeframe[timeframe] ?? [];

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {available.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setTimeframe(tf)}
            aria-pressed={tf === timeframe}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              tf === timeframe
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      <PriceChart candles={candles} levels={levels} />

      <p className="mt-1 text-[11px] text-muted-foreground">
        {timeframe} candles — the levels above, drawn where they sit.
      </p>
    </div>
  );
}
