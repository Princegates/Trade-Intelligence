"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Subscribes to the signals feed (Supabase Realtime) and refreshes the
 * current route's server-rendered data whenever a new signal or
 * suppression is published, so the dashboard updates itself without a
 * manual reload. Returns whether the subscription is currently connected,
 * for a "Live" indicator. Always disconnected in demo mode
 * (createClient() returns null) and requires
 * supabase/migrations/0004_realtime.sql to have been run — that migration
 * adds both tables to the supabase_realtime publication, which isn't the
 * default for a fresh Supabase project. */
export function useSignalsRealtime() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel("signals-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "signals" }, () => {
        router.refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "signal_suppressions" }, () => {
        router.refresh();
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      setConnected(false);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return { connected };
}
