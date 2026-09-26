"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setEngineSettings, type EngineSettingsFormState } from "@/lib/actions/engine-settings";
import type { EngineSettings } from "@/lib/engine-settings";

const initialState: EngineSettingsFormState = {};

function NumberField({
  id,
  label,
  help,
  value,
  onChange,
  min = 0,
  max,
  step = "any",
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-32"
        required
      />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

/** Admin-configurable entry-quality thresholds for the Python signal
 * engine — see src/signals/engine.py's own module docstring for what the
 * confidence score is (and isn't), and src/storage/supabase.py::
 * get_engine_settings() for how the engine reads this row once per run.
 * Every threshold defaults to a value that reproduces the engine's
 * pre-3.0.0 fixed behavior; saving a change here takes effect on the next
 * scheduled run, not retroactively on already-published signals. */
export function EngineSettingsForm({ settings }: { settings: EngineSettings }) {
  const [atrStopMultiplier, setAtrStopMultiplier] = useState(String(settings.atrStopMultiplier));
  const [rewardToRisk, setRewardToRisk] = useState(String(settings.rewardToRisk));
  const [minRewardToRisk, setMinRewardToRisk] = useState(String(settings.minRewardToRisk));
  const [minConfidenceThreshold, setMinConfidenceThreshold] = useState(String(settings.minConfidenceThreshold));
  const [confidenceHighThreshold, setConfidenceHighThreshold] = useState(String(settings.confidenceHighThreshold));
  const [confidenceVeryHighThreshold, setConfidenceVeryHighThreshold] = useState(
    String(settings.confidenceVeryHighThreshold)
  );
  const [requireConfluence, setRequireConfluence] = useState(settings.requireHigherTimeframeConfluence);
  const [structureBufferAtr, setStructureBufferAtr] = useState(String(settings.structureBufferAtr));
  const [entryZoneWidthAtr, setEntryZoneWidthAtr] = useState(String(settings.entryZoneWidthAtr));
  const [maxEntryZoneDistanceAtr, setMaxEntryZoneDistanceAtr] = useState(String(settings.maxEntryZoneDistanceAtr));
  const [lifecycleWatchZoneHalfWidths, setLifecycleWatchZoneHalfWidths] = useState(
    String(settings.lifecycleWatchZoneHalfWidths)
  );
  const [lifecycleConfirmMoveR, setLifecycleConfirmMoveR] = useState(String(settings.lifecycleConfirmMoveR));
  const [lifecycleExpiryCandles, setLifecycleExpiryCandles] = useState(String(settings.lifecycleExpiryCandles));
  const [state, formAction, pending] = useActionState(setEngineSettings, initialState);

  const unchanged =
    atrStopMultiplier === String(settings.atrStopMultiplier) &&
    rewardToRisk === String(settings.rewardToRisk) &&
    minRewardToRisk === String(settings.minRewardToRisk) &&
    minConfidenceThreshold === String(settings.minConfidenceThreshold) &&
    confidenceHighThreshold === String(settings.confidenceHighThreshold) &&
    confidenceVeryHighThreshold === String(settings.confidenceVeryHighThreshold) &&
    requireConfluence === settings.requireHigherTimeframeConfluence &&
    structureBufferAtr === String(settings.structureBufferAtr) &&
    entryZoneWidthAtr === String(settings.entryZoneWidthAtr) &&
    maxEntryZoneDistanceAtr === String(settings.maxEntryZoneDistanceAtr) &&
    lifecycleWatchZoneHalfWidths === String(settings.lifecycleWatchZoneHalfWidths) &&
    lifecycleConfirmMoveR === String(settings.lifecycleConfirmMoveR) &&
    lifecycleExpiryCandles === String(settings.lifecycleExpiryCandles);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id="atrStopMultiplier"
          label="ATR stop multiplier"
          help="How many ATRs from price the stop sits."
          value={atrStopMultiplier}
          onChange={setAtrStopMultiplier}
          min={0.01}
          step="0.05"
        />
        <NumberField
          id="rewardToRisk"
          label="Reward:risk"
          help="Target distance as a multiple of the stop distance."
          value={rewardToRisk}
          onChange={setRewardToRisk}
          min={0.01}
          step="0.1"
        />
        <NumberField
          id="minRewardToRisk"
          label="Minimum reward:risk"
          help="A call whose computed risk/reward falls below this is held instead of published. Setting this above reward:risk suppresses every directional call — useful to know, not a bug."
          value={minRewardToRisk}
          onChange={setMinRewardToRisk}
          min={0.01}
          step="0.1"
        />
        <NumberField
          id="minConfidenceThreshold"
          label="Minimum confidence to trade"
          help="A call scoring below this (out of 100) is held instead of published. This is confluence strength — how much of the engine's own evidence agrees with itself — not a win rate."
          value={minConfidenceThreshold}
          onChange={setMinConfidenceThreshold}
          max={100}
        />
        <NumberField
          id="confidenceHighThreshold"
          label="High-confidence label at"
          help="Display band only — doesn't affect what publishes."
          value={confidenceHighThreshold}
          onChange={setConfidenceHighThreshold}
          max={100}
        />
        <NumberField
          id="confidenceVeryHighThreshold"
          label="Very-high-confidence label at"
          help="Display band only — doesn't affect what publishes."
          value={confidenceVeryHighThreshold}
          onChange={setConfidenceVeryHighThreshold}
          max={100}
        />
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="requireHigherTimeframeConfluence">Require higher-timeframe confluence</Label>
          <p className="text-xs text-muted-foreground">
            Hold a call when the next timeframe up is structurally trending against it.
          </p>
        </div>
        <Switch
          id="requireHigherTimeframeConfluence"
          name="requireHigherTimeframeConfluence"
          checked={requireConfluence}
          onCheckedChange={setRequireConfluence}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          id="structureBufferAtr"
          label="Structure buffer (ATR)"
          help="How far a structural stop sits beyond its swing level."
          value={structureBufferAtr}
          onChange={setStructureBufferAtr}
          min={0.01}
          step="0.05"
        />
        <NumberField
          id="entryZoneWidthAtr"
          label="Entry zone width (ATR)"
          help="Half-width of the preferred-entry band around a structural level."
          value={entryZoneWidthAtr}
          onChange={setEntryZoneWidthAtr}
          min={0.01}
          step="0.05"
        />
        <NumberField
          id="maxEntryZoneDistanceAtr"
          label="Max entry-zone distance (ATR)"
          help="A call whose price has run this many ATRs from its own entry zone is held instead of published. Live by default, not opt-in — unlike the R:R/confidence gates above."
          value={maxEntryZoneDistanceAtr}
          onChange={setMaxEntryZoneDistanceAtr}
          min={0.01}
          step="0.1"
        />
      </div>

      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">Signal lifecycle</p>
        <p className="text-xs text-muted-foreground">
          How a tracked signal&apos;s entry thesis is re-evaluated on every scheduled run, from WAIT through WATCH,
          READY and CONFIRMED, or resolved early to INVALIDATED/EXPIRED. Only directional calls with real structural
          entry-zone data are tracked at all.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          id="lifecycleWatchZoneHalfWidths"
          label="Watch distance (zone half-widths)"
          help="How many entry-zone half-widths away counts as WATCH rather than WAIT."
          value={lifecycleWatchZoneHalfWidths}
          onChange={setLifecycleWatchZoneHalfWidths}
          min={0.01}
          step="0.1"
        />
        <NumberField
          id="lifecycleConfirmMoveR"
          label="Confirm move (risk-units)"
          help="How far price must move favorably, as a multiple of the original risk (entry to stop), before a signal is CONFIRMED."
          value={lifecycleConfirmMoveR}
          onChange={setLifecycleConfirmMoveR}
          min={0.01}
          step="0.1"
        />
        <NumberField
          id="lifecycleExpiryCandles"
          label="Expiry (candles)"
          help="How many candles of the signal's own timeframe can pass with no resolution before it's marked EXPIRED."
          value={lifecycleExpiryCandles}
          onChange={setLifecycleExpiryCandles}
          min={1}
          step="1"
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}

      <Button type="submit" disabled={pending || unchanged}>
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
