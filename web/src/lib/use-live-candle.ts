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

// Tried in order until one delivers data, then stuck with. The first is
// Binance's market-data-only host on the standard HTTPS port, which gets
// through networks that block the older :9443 default (the last resort).
const ENDPOINTS = [
  "wss://data-stream.binance.vision/ws",
  "wss://stream.binance.com:443/ws",
  "wss://stream.binance.com:9443/ws",
];

// Backoff between reconnect attempts; reset once data flows again.
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

// Binance pushes the forming kline every second or two. Much longer with
// nothing means the connection has died without closing — common after a
// phone sleeps or changes network — so it's dropped and reopened.
const SILENCE_LIMIT_MS = 15_000;

/** The still-forming candle, streamed live.
 *
 * Deliberately separate from the stored candles the chart draws: those came
 * through the engine's quality gates and are what the signals were computed
 * on. This one has passed through nothing and is never allowed to influence
 * a verdict — it exists so the chart moves between closes, and nothing else.
 *
 * Keeps itself connected: reconnects with backoff when the socket closes,
 * errors or goes silent, pauses while the tab is hidden, and resumes when it
 * is shown again or the device comes back online. Returns null whenever it
 * isn't receiving, so the chart's "live" marker never outlasts the stream. */
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

    const seriesKey = `${symbol}:${timeframe}`;
    let socket: WebSocket | null = null;
    let endpoint = 0;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let silenceTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const disconnect = () => {
      clearTimeout(retryTimer);
      clearTimeout(silenceTimer);
      if (!socket) return;
      socket.onmessage = socket.onclose = socket.onerror = null;
      socket.close();
      socket = null;
    };

    const scheduleReconnect = () => {
      if (stopped || document.visibilityState !== "visible") return;
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    };

    function connect() {
      disconnect();
      let received = false;

      try {
        socket = new WebSocket(`${ENDPOINTS[endpoint]}/${stream}@kline_${timeframe}`);
      } catch {
        endpoint = (endpoint + 1) % ENDPOINTS.length;
        scheduleReconnect();
        return;
      }

      const lost = () => {
        // Never got a message here: try the next endpoint. Did get some: the
        // host works, the connection just dropped, so retry the same one.
        if (!received) endpoint = (endpoint + 1) % ENDPOINTS.length;
        disconnect();
        setTick(null);
        scheduleReconnect();
      };

      const armSilenceTimer = () => {
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(lost, SILENCE_LIMIT_MS);
      };
      armSilenceTimer();

      socket.onmessage = (event) => {
        try {
          const { k } = JSON.parse(event.data);
          if (!k) return;
          received = true;
          attempt = 0;
          armSilenceTimer();
          setTick({
            key: seriesKey,
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
      // An error is always followed by a close; handling both would
      // reconnect twice.
      socket.onclose = lost;
    }

    // A hidden tab has no one watching the chart, and phones kill its
    // sockets anyway — so close it deliberately and reopen on return,
    // rather than finding it dead later.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        attempt = 0;
        connect();
      } else {
        disconnect();
        setTick(null);
      }
    };
    const onOnline = () => {
      if (document.visibilityState !== "visible") return;
      attempt = 0;
      connect();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    if (document.visibilityState === "visible") connect();

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      disconnect();
    };
  }, [symbol, timeframe]);

  return tick?.key === key ? tick.candle : null;
}
