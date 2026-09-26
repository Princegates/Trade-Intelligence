"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export interface EngineSettingsFormState {
  error?: string;
  success?: boolean;
}

const positiveNumber = (label: string) => z.coerce.number().positive(`${label} must be greater than 0.`);
const positiveInt = (label: string) =>
  z.coerce.number().int(`${label} must be a whole number.`).positive(`${label} must be greater than 0.`);
const percentage = (label: string) =>
  z.coerce.number().min(0, `${label} must be 0 or more.`).max(100, `${label} must be 100 or fewer.`);

const schema = z
  .object({
    atrStopMultiplier: positiveNumber("ATR stop multiplier"),
    rewardToRisk: positiveNumber("Reward:risk"),
    minRewardToRisk: positiveNumber("Minimum reward:risk"),
    minConfidenceThreshold: percentage("Minimum confidence"),
    confidenceHighThreshold: percentage("High-confidence threshold"),
    confidenceVeryHighThreshold: percentage("Very-high-confidence threshold"),
    structureBufferAtr: positiveNumber("Structure buffer"),
    entryZoneWidthAtr: positiveNumber("Entry zone width"),
    maxEntryZoneDistanceAtr: positiveNumber("Maximum entry-zone distance"),
    lifecycleWatchZoneHalfWidths: positiveNumber("Watch zone half-widths"),
    lifecycleConfirmMoveR: positiveNumber("Confirm move (R)"),
    lifecycleExpiryCandles: positiveInt("Expiry candles"),
  })
  .refine((v) => v.minConfidenceThreshold < v.confidenceHighThreshold, {
    message: "Minimum confidence must be below the high-confidence threshold.",
    path: ["minConfidenceThreshold"],
  })
  .refine((v) => v.confidenceHighThreshold < v.confidenceVeryHighThreshold, {
    message: "The high-confidence threshold must be below the very-high one.",
    path: ["confidenceHighThreshold"],
  });

/** Saves the admin-configurable entry-quality thresholds the Python signal
 * engine reads once per run (src/storage/supabase.py::get_engine_settings(),
 * threaded into src/signals/engine.py::evaluate() — see that module's own
 * docstring for what each gate actually does). Mirrors
 * setAccessPolicy()'s shape exactly. */
export async function setEngineSettings(
  _prevState: EngineSettingsFormState,
  formData: FormData
): Promise<EngineSettingsFormState> {
  const admin = await requireAdmin();

  const parsed = schema.safeParse({
    atrStopMultiplier: formData.get("atrStopMultiplier"),
    rewardToRisk: formData.get("rewardToRisk"),
    minRewardToRisk: formData.get("minRewardToRisk"),
    minConfidenceThreshold: formData.get("minConfidenceThreshold"),
    confidenceHighThreshold: formData.get("confidenceHighThreshold"),
    confidenceVeryHighThreshold: formData.get("confidenceVeryHighThreshold"),
    structureBufferAtr: formData.get("structureBufferAtr"),
    entryZoneWidthAtr: formData.get("entryZoneWidthAtr"),
    maxEntryZoneDistanceAtr: formData.get("maxEntryZoneDistanceAtr"),
    lifecycleWatchZoneHalfWidths: formData.get("lifecycleWatchZoneHalfWidths"),
    lifecycleConfirmMoveR: formData.get("lifecycleConfirmMoveR"),
    lifecycleExpiryCandles: formData.get("lifecycleExpiryCandles"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  if (!isSupabaseConfigured()) return { error: "Demo mode: policy changes aren't saved." };

  const supabase = await createClient();
  if (!supabase) return { error: "Could not connect to Supabase." };

  const requireConfluence = formData.get("requireHigherTimeframeConfluence") === "on";

  const { error } = await supabase
    .from("engine_settings")
    .update({
      atr_stop_multiplier: parsed.data.atrStopMultiplier,
      reward_to_risk: parsed.data.rewardToRisk,
      min_reward_to_risk: parsed.data.minRewardToRisk,
      min_confidence_threshold: parsed.data.minConfidenceThreshold,
      confidence_high_threshold: parsed.data.confidenceHighThreshold,
      confidence_very_high_threshold: parsed.data.confidenceVeryHighThreshold,
      require_higher_timeframe_confluence: requireConfluence,
      structure_buffer_atr: parsed.data.structureBufferAtr,
      entry_zone_width_atr: parsed.data.entryZoneWidthAtr,
      max_entry_zone_distance_atr: parsed.data.maxEntryZoneDistanceAtr,
      lifecycle_watch_zone_half_widths: parsed.data.lifecycleWatchZoneHalfWidths,
      lifecycle_confirm_move_r: parsed.data.lifecycleConfirmMoveR,
      lifecycle_expiry_candles: parsed.data.lifecycleExpiryCandles,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { success: true };
}
