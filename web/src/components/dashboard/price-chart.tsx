"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type AutoscaleInfo,
  type UTCTimestamp,
} from "lightweight-charts";

import type { Candle } from "@/lib/candle-view";

export interface ChartLevel {
  price: number;
  label: string;
  colour: string;
}

/** Candles with the signal's own levels drawn across them.
 *
 * A stop is far easier to judge against the range price has actually been
 * covering than as a number in a table, which is the whole reason the levels
 * are drawn here rather than only listed. */
export function PriceChart({
  candles,
  levels = [],
  height = 320,
}: {
  candles: Candle[];
  levels?: ChartLevel[];
  height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Read inside the autoscale callback, which is installed once and must see
  // the current levels rather than the ones captured at creation. Written in
  // the effect below, never during render.
  const levelsRef = useRef<ChartLevel[]>(levels);

  // Create once. Re-creating on every data change would drop the viewer's
  // zoom and pan.
  useEffect(() => {
    if (!container.current) return;

    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue("--muted-foreground").trim() || "#71717a";
    const grid = styles.getPropertyValue("--border").trim() || "#e4e4e7";

    const created = createChart(container.current, {
      height,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid },
      timeScale: { borderColor: grid, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      autoSize: true,
    });

    series.current = created.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
      // Price lines do not affect the price scale on their own, so a stop or
      // target outside the range price has covered would be drawn off-screen
      // — which is precisely the level you need to see.
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const base = original();
        const prices = levelsRef.current.map((l) => l.price);
        if (!base?.priceRange || prices.length === 0) return base;
        return {
          ...base,
          priceRange: {
            minValue: Math.min(base.priceRange.minValue, ...prices),
            maxValue: Math.max(base.priceRange.maxValue, ...prices),
          },
        };
      },
    });

    chart.current = created;
    return () => {
      created.remove();
      chart.current = null;
      series.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!series.current || candles.length === 0) return;
    // `time` is a branded UTCTimestamp in v5; ours are already epoch seconds.
    series.current.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    chart.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    const target = series.current;
    if (!target) return;

    levelsRef.current = levels;

    const drawn = levels.map((level) =>
      target.createPriceLine({
        price: level.price,
        color: level.colour,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: level.label,
      }),
    );

    target.applyOptions({});  // nudge the price scale to re-run autoscale

    return () => {
      for (const line of drawn) target.removePriceLine(line);
    };
  }, [levels]);

  if (candles.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border text-sm text-muted-foreground"
        style={{ height }}
      >
        No candles stored yet for this series.
      </div>
    );
  }

  return <div ref={container} style={{ height }} className="w-full" />;
}
