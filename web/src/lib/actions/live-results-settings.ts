"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { actorOf, logActivity } from "@/lib/activity-log";
import type { ActivityAction } from "@/lib/activity-log-view";

const SWITCHES = {
  enabled: { label: "Live results on the dashboard", action: "admin.live_results_toggled" },
  show_backtest_odds: { label: "Backtest odds on signals", action: "admin.backtest_odds_toggled" },
} as const satisfies Record<string, { label: string; action: ActivityAction }>;

async function setSwitch(field: keyof typeof SWITCHES, on: boolean) {
  const admin = await requireAdmin();

  if (!isSupabaseConfigured()) return { error: "Demo mode: this setting isn't persisted." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const { error } = await supabase
    .from("live_results_settings")
    .update(
      field === "enabled"
        ? { enabled: on, updated_at: new Date().toISOString() }
        : { show_backtest_odds: on, updated_at: new Date().toISOString() }
    )
    .eq("id", true);
  if (error) return { error: error.message };

  logActivity({
    action: SWITCHES[field].action,
    actor: actorOf(admin),
    target: { type: "setting", label: SWITCHES[field].label },
    details: { visible_to_users: on },
  });

  revalidatePath("/admin/settings");
  return { success: true };
}

export async function setLiveResultsEnabled(enabled: boolean) {
  return setSwitch("enabled", enabled);
}

export async function setBacktestOddsEnabled(enabled: boolean) {
  return setSwitch("show_backtest_odds", enabled);
}
