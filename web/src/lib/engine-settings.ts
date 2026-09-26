import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Mirrors the defaults baked into web/supabase/migrations/0014_engine_settings.sql
// so an unconfigured/unreachable Supabase project reproduces the same
// behavior the migration's own column defaults would give a fresh row —
// atrStopMultiplier/rewardToRisk match the engine's pre-3.0.0 fixed
// constants, minRewardToRisk defaults equal to rewardToRisk so the R:R gate
// stays inert out of the box, minConfidenceThreshold matches the spec's own
// suggested "below 65 = no trade" default.
const DEFAULT_ATR_STOP_MULTIPLIER = 0.75;
const DEFAULT_REWARD_TO_RISK = 1.5;
const DEFAULT_MIN_REWARD_TO_RISK = 1.5;
const DEFAULT_MIN_CONFIDENCE_THRESHOLD = 65;
const DEFAULT_CONFIDENCE_HIGH_THRESHOLD = 75;
const DEFAULT_CONFIDENCE_VERY_HIGH_THRESHOLD = 85;
const DEFAULT_REQUIRE_HIGHER_TIMEFRAME_CONFLUENCE = true;

export interface EngineSettings {
  /** How many ATRs from price the stop sits. Admin-controlled, see
   * /admin/settings. */
  atrStopMultiplier: number;
  /** Target distance as a multiple of the stop distance. */
  rewardToRisk: number;
  /** A directional call with a computed risk/reward below this is
   * overridden to HOLD. No relationship enforced against rewardToRisk in
   * this type — the database CHECK constraints are the enforcement layer;
   * setting this above rewardToRisk is a deliberate way to suppress every
   * directional signal. */
  minRewardToRisk: number;
  /** A directional call scoring below this (out of 100) is overridden to
   * HOLD. The confidence score is a transparent read of how much of the
   * engine's own evidence agrees with itself, not a calibrated win
   * probability — see src/signals/engine.py. */
  minConfidenceThreshold: number;
  /** Pure display-band boundaries, not gates. */
  confidenceHighThreshold: number;
  confidenceVeryHighThreshold: number;
  /** Whether an opposing higher-timeframe structural bias overrides a call
   * to HOLD (src/signals/confluence.py). */
  requireHigherTimeframeConfluence: boolean;
}

const DEFAULTS: EngineSettings = {
  atrStopMultiplier: DEFAULT_ATR_STOP_MULTIPLIER,
  rewardToRisk: DEFAULT_REWARD_TO_RISK,
  minRewardToRisk: DEFAULT_MIN_REWARD_TO_RISK,
  minConfidenceThreshold: DEFAULT_MIN_CONFIDENCE_THRESHOLD,
  confidenceHighThreshold: DEFAULT_CONFIDENCE_HIGH_THRESHOLD,
  confidenceVeryHighThreshold: DEFAULT_CONFIDENCE_VERY_HIGH_THRESHOLD,
  requireHigherTimeframeConfluence: DEFAULT_REQUIRE_HIGHER_TIMEFRAME_CONFLUENCE,
};

export async function getEngineSettings(): Promise<EngineSettings> {
  if (!isSupabaseConfigured()) return DEFAULTS;

  const supabase = await createClient();
  if (!supabase) return DEFAULTS;

  const { data } = await supabase
    .from("engine_settings")
    .select(
      "atr_stop_multiplier, reward_to_risk, min_reward_to_risk, min_confidence_threshold, confidence_high_threshold, confidence_very_high_threshold, require_higher_timeframe_confluence"
    )
    .eq("id", true)
    .maybeSingle();

  return {
    atrStopMultiplier: data?.atr_stop_multiplier ?? DEFAULTS.atrStopMultiplier,
    rewardToRisk: data?.reward_to_risk ?? DEFAULTS.rewardToRisk,
    minRewardToRisk: data?.min_reward_to_risk ?? DEFAULTS.minRewardToRisk,
    minConfidenceThreshold: data?.min_confidence_threshold ?? DEFAULTS.minConfidenceThreshold,
    confidenceHighThreshold: data?.confidence_high_threshold ?? DEFAULTS.confidenceHighThreshold,
    confidenceVeryHighThreshold: data?.confidence_very_high_threshold ?? DEFAULTS.confidenceVeryHighThreshold,
    requireHigherTimeframeConfluence:
      data?.require_higher_timeframe_confluence ?? DEFAULTS.requireHigherTimeframeConfluence,
  };
}
