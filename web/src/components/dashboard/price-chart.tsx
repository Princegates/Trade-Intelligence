"use client";

import { useEffect, useRef, useState } from "react";
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
  liveCandle = null,
  height = 320,
}: {
  candles: Candle[];
  levels?: ChartLevel[];
  /** The still-forming candle, streamed from the exchange. Applied on top of
   * the stored series so the chart moves between closes; never mixed into
   * `candles`, which are the quality-gated ones the signals used. */
  liveCandle?: Candle | null;
  height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Read inside the autoscale callback, which is installed once and must see
  // the current levels rather than the ones captured at creation. Written in
  // the effect below, never during render.
  const levelsRef = useRef<ChartLevel[]>(levels);

  // Bumped whenever the chart is rebuilt. The data and level effects depend
  // on it so they reapply to the new series — otherwise a rebuild with
  // unchanged candles leaves an empty chart, and unchanged levels leaves it
  // with no lines.
  const [chartGeneration, setChartGeneration] = useState(0);

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
    setChartGeneration((n) => n + 1);

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
  }, [candles, chartGeneration]);

  // The live candle arrives many times a second. `update` touches only the
  // last bar, unlike setData which rebuilds the series and would fight the
  // viewer's zoom and pan on every tick.
  useEffect(() => {
    if (!series.current || !liveCandle || candles.length === 0) return;
    // Ignore a tick for a bar older than what is stored: the stored one has
    // closed and is authoritative, and redrawing over it would repaint.
    if (liveCandle.time < candles[candles.length - 1].time) return;
    series.current.update({ ...liveCandle, time: liveCandle.time as UTCTimestamp });
  }, [liveCandle, candles, chartGeneration]);

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

    target.applyOptions({}); // nudge the price scale to re-run autoscale

    return () => {
      // The chart's own cleanup runs first and destroys the series with it,
      // so by the time this runs `target` may already be disposed — touching
      // it then throws "Object is disposed". It is only still ours to tidy
      // if the series has not been replaced or torn down underneath us.
      if (series.current !== target) return;
      for (const line of drawn) target.removePriceLine(line);
    };
  }, [levels, chartGeneration]);

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
