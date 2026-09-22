// The candle shape and the list of chart timeframes. Kept free of
// `server-only` so client components can import them: the chart and its
// timeframe picker run in the browser, and reaching for these through the
// data-access module drags a server-only import into the client bundle.

export interface Candle {
  /** Seconds since epoch — what lightweight-charts expects. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Chart timeframes, coarsest last — the order they are offered in. */
export const CHART_TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"] as const;
