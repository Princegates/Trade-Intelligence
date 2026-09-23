"use client";

import { useState } from "react";

import { PriceChart, type ChartLevel } from "@/components/dashboard/price-chart";
import { CHART_TIMEFRAMES, type Candle } from "@/lib/candle-view";
import { useLiveCandle } from "@/lib/use-live-candle";

/** The chart plus its timeframe picker.
 *
 * Every timeframe's candles arrive together, so switching is instant. The
 * levels stay on screen whichever is chosen — they are prices, and a daily
 * stop is just as real on a 5m chart, often more informative there. */
export function ChartPanel({
  candlesByTimeframe,
  levels,
  levelsTimeframe,
  symbol,
}: {
  candlesByTimeframe: Record<string, Candle[]>;
  levels: ChartLevel[];
  symbol: string;
  /** Which timeframe's setup the levels describe. Also the one shown first,
   * since that is the chart they were measured against. */
  levelsTimeframe?: string;
}) {
  const available = CHART_TIMEFRAMES.filter((tf) => (candlesByTimeframe[tf]?.length ?? 0) > 0);
  const [timeframe, setTimeframe] = useState(
    levelsTimeframe && available.includes(levelsTimeframe as (typeof CHART_TIMEFRAMES)[number])
      ? levelsTimeframe
      : (available.at(-1) ?? ""),
  );

  const candles = candlesByTimeframe[timeframe] ?? [];
  const liveCandle = useLiveCandle(symbol, timeframe);

  if (available.length === 0) return null;

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

      <PriceChart candles={candles} levels={levels} liveCandle={liveCandle} />

      <p className="mt-1 text-[11px] text-muted-foreground">
        {liveCandle && (
          <span className="mr-1 inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-current" />
            live
          </span>
        )}
        {timeframe} candles.{" "}
        {levels.length === 0
          ? "No levels to draw."
          : levelsTimeframe && levelsTimeframe !== timeframe
            ? // Levels are sized from their own timeframe's volatility, so on a
              // different chart they are real prices but not measured against
              // the candles under them. Saying which keeps that honest.
              `Levels are from the ${levelsTimeframe} setup, not sized to these candles.`
            : "Levels are sized to these candles."}
      </p>
    </div>
  );
}
