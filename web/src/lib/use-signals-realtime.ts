"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const POLL_INTERVAL_MS = 60_000;

/** Refreshes the current route's server-rendered data on an interval, so the
 * dashboard updates itself without a manual reload. Returns whether polling
 * is currently active, for a "Live" indicator.
 *
 * Previously a Supabase Realtime subscription: one open websocket per
 * browser tab, watching four tables for changes. The data behind those
 * tables only ever changes on the cron job's own schedule (src/run.py) —
 * 5+ minutes apart, never faster — so a per-tab persistent connection was
 * paying for push semantics the update cadence never needed. Plain
 * polling gives the same "feels live" experience at a fraction of the
 * connection cost, and doesn't care which of the four tables actually
 * changed.
 *
 * Only polls while the tab is visible (Page Visibility API) — a
 * backgrounded tab has no one watching the "Live" badge, and the next
 * refresh happens as soon as the tab is foregrounded again. Always
 * inactive in demo mode, matching the old subscription's behavior when
 * Supabase wasn't configured. */
export function useSignalsRealtime() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let interval: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (interval) return;
      interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
      setConnected(true);
    };

    const stop = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = undefined;
      setConnected(false);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [router]);

  return { connected };
}
