"use client";

import { useEffect, useState } from "react";

import type { Candle } from "@/lib/candle-view";

/** Instruments with a public stream the browser can subscribe to.
 *
 * Binance's is free and needs no key. Twelve Data's is a paid feature, so
 * gold has no live stream and steps forward as its candles close instead. */
const BINANCE_SYMBOLS: Record<string, string> = {
  BTCUSDT: "btcusdt",
};

/** The still-forming candle, streamed live.
 *
 * Deliberately separate from the stored candles the chart draws: those came
 * through the engine's quality gates and are what the signals were computed
 * on. This one has passed through nothing and is never allowed to influence
 * a verdict — it exists so the chart moves between closes, and nothing else.
 *
 * Returns null while disconnected, which includes the cases where there is no
 * stream for the instrument and where the viewer's network blocks the
 * exchange. Both are ordinary: the chart simply does not tick. */
export function useLiveCandle(symbol: string, timeframe: string): Candle | null {
  // Tagged with the series it belongs to rather than cleared when that
  // changes: resetting state from inside the effect body triggers a cascading
  // render, and a tick from the previous timeframe is discarded on read just
  // as effectively.
  const [tick, setTick] = useState<{ key: string; candle: Candle } | null>(null);
  const key = `${symbol}:${timeframe}`;

  useEffect(() => {
    const stream = BINANCE_SYMBOLS[symbol];
    if (!stream) return;

    let socket: WebSocket;
    try {
      socket = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}@kline_${timeframe}`);
    } catch {
      return; // Blocked outright; the chart keeps its stored candles.
    }

    socket.onmessage = (event) => {
      try {
        const { k } = JSON.parse(event.data);
        if (!k) return;
        setTick({
          key: `${symbol}:${timeframe}`,
          candle: {
            time: Math.floor(k.t / 1000),
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
          },
        });
      } catch {
        // A malformed frame is not worth tearing the socket down for.
      }
    };

    // No error handling beyond this: a refused or dropped connection means no
    // live candle, which the chart already renders correctly.
    socket.onerror = () => setTick(null);

    return () => {
      socket.onmessage = null;
      socket.onerror = null;
      socket.close();
    };
  }, [symbol, timeframe]);

  return tick?.key === key ? tick.candle : null;
}
