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
// Mirrors 0017_engine_settings_entry_zone.sql's own defaults —
// structure_buffer_atr/entry_zone_width_atr apply even without this row at
// all (src/signals/engine.py's own STRUCTURE_BUFFER_ATR/ENTRY_ZONE_WIDTH_ATR
// module constants). max_entry_zone_distance_atr is the one genuinely new
// gate; like min_confidence_threshold, it's live by default rather than
// opt-in — see the migration's own comment for why 1.5 isn't arbitrary.
const DEFAULT_STRUCTURE_BUFFER_ATR = 0.25;
const DEFAULT_ENTRY_ZONE_WIDTH_ATR = 0.5;
const DEFAULT_MAX_ENTRY_ZONE_DISTANCE_ATR = 1.5;
// Mirrors 0019_engine_settings_lifecycle.sql's own defaults — all three
// are live from the moment the migration is applied, same "admin-
// adjustable, not opt-in" pattern as max_entry_zone_distance_atr above.
const DEFAULT_LIFECYCLE_WATCH_ZONE_HALF_WIDTHS = 2.0;
const DEFAULT_LIFECYCLE_CONFIRM_MOVE_R = 1.0;
const DEFAULT_LIFECYCLE_EXPIRY_CANDLES = 20;

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
  /** ATR fraction buffering a structural stop beyond its swing level
   * (src/signals/entry_zone.py::structural_stop()). Always-on — this only
   * controls the buffer's size, not whether structural stops are used. */
  structureBufferAtr: number;
  /** Half-width, in ATRs, of the preferred-entry band around a structural
   * level (src/signals/entry_zone.py::entry_zone()). */
  entryZoneWidthAtr: number;
  /** A directional call whose price has run more than this many ATRs from
   * its own entry zone is overridden to HOLD — live by default, not
   * opt-in (src/signals/entry_zone.py::distance_exceeds()). */
  maxEntryZoneDistanceAtr: number;
  /** How many entry-zone half-widths away from its own zone a tracked
   * signal counts as WATCH rather than WAIT (src/signals/lifecycle.py). */
  lifecycleWatchZoneHalfWidths: number;
  /** How many risk-units (multiples of abs(entry-stop)) a favorable move
   * needs before a signal is CONFIRMED (src/signals/lifecycle.py). */
  lifecycleConfirmMoveR: number;
  /** How many candles of a signal's own timeframe can pass with no
   * resolution before it is marked EXPIRED (src/signals/lifecycle.py). */
  lifecycleExpiryCandles: number;
}

const DEFAULTS: EngineSettings = {
  atrStopMultiplier: DEFAULT_ATR_STOP_MULTIPLIER,
  rewardToRisk: DEFAULT_REWARD_TO_RISK,
  minRewardToRisk: DEFAULT_MIN_REWARD_TO_RISK,
  minConfidenceThreshold: DEFAULT_MIN_CONFIDENCE_THRESHOLD,
  confidenceHighThreshold: DEFAULT_CONFIDENCE_HIGH_THRESHOLD,
  confidenceVeryHighThreshold: DEFAULT_CONFIDENCE_VERY_HIGH_THRESHOLD,
  requireHigherTimeframeConfluence: DEFAULT_REQUIRE_HIGHER_TIMEFRAME_CONFLUENCE,
  structureBufferAtr: DEFAULT_STRUCTURE_BUFFER_ATR,
  entryZoneWidthAtr: DEFAULT_ENTRY_ZONE_WIDTH_ATR,
  maxEntryZoneDistanceAtr: DEFAULT_MAX_ENTRY_ZONE_DISTANCE_ATR,
  lifecycleWatchZoneHalfWidths: DEFAULT_LIFECYCLE_WATCH_ZONE_HALF_WIDTHS,
  lifecycleConfirmMoveR: DEFAULT_LIFECYCLE_CONFIRM_MOVE_R,
  lifecycleExpiryCandles: DEFAULT_LIFECYCLE_EXPIRY_CANDLES,
};

export async function getEngineSettings(): Promise<EngineSettings> {
  if (!isSupabaseConfigured()) return DEFAULTS;

  const supabase = await createClient();
  if (!supabase) return DEFAULTS;

  const { data } = await supabase
    .from("engine_settings")
    .select(
      "atr_stop_multiplier, reward_to_risk, min_reward_to_risk, min_confidence_threshold, confidence_high_threshold, confidence_very_high_threshold, require_higher_timeframe_confluence, structure_buffer_atr, entry_zone_width_atr, max_entry_zone_distance_atr, lifecycle_watch_zone_half_widths, lifecycle_confirm_move_r, lifecycle_expiry_candles"
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
    structureBufferAtr: data?.structure_buffer_atr ?? DEFAULTS.structureBufferAtr,
    entryZoneWidthAtr: data?.entry_zone_width_atr ?? DEFAULTS.entryZoneWidthAtr,
    maxEntryZoneDistanceAtr: data?.max_entry_zone_distance_atr ?? DEFAULTS.maxEntryZoneDistanceAtr,
    lifecycleWatchZoneHalfWidths: data?.lifecycle_watch_zone_half_widths ?? DEFAULTS.lifecycleWatchZoneHalfWidths,
    lifecycleConfirmMoveR: data?.lifecycle_confirm_move_r ?? DEFAULTS.lifecycleConfirmMoveR,
    lifecycleExpiryCandles: data?.lifecycle_expiry_candles ?? DEFAULTS.lifecycleExpiryCandles,
  };
}
