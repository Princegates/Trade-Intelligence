"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTRACTS, HIGH_RISK_PCT, LOT_STEP, lotOutcome } from "@/lib/position-size";

// Balance and lot size are remembered in this browser only, as a convenience.
const STORAGE_KEY = "position-size:v2";
const DEFAULT_LOTS = String(LOT_STEP);

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const pct = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 1 : 0 })}%`;
// A price as an editable field value: cents, without float noise like 2338.2401999999.
const priceField = (n: number) => String(Number(n.toFixed(2)));

function readSaved(): { balance: string; lots: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      balance: typeof saved.balance === "string" ? saved.balance : "",
      lots: typeof saved.lots === "string" ? saved.lots : DEFAULT_LOTS,
    };
  } catch {
    return { balance: "", lots: DEFAULT_LOTS };
  }
}

function save(balance: string, lots: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ balance, lots }));
  } catch {
    // Private windows and blocked storage: the calculator still works, it just won't remember.
  }
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  step = "any",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} type="number" inputMode="decimal" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The form itself, mounted only while the dialog is open (Radix unmounts
 * closed content), so reading localStorage in the initial state never runs
 * on the server. */
function PositionSizeForm({ symbol, entry: calledEntry, stop: calledStop, target }: PositionSizeDialogProps) {
  const contract = CONTRACTS[symbol] ?? { lotSize: 1, unit: "units" };
  const [saved] = useState(readSaved);
  const [lots, setLots] = useState(saved.lots);
  const [balance, setBalance] = useState(saved.balance);
  const [entry, setEntry] = useState(priceField(calledEntry));
  const [stop, setStop] = useState(priceField(calledStop));

  const result = lotOutcome({
    lots: Number(lots),
    entry: Number(entry),
    stop: Number(stop),
    target,
    lotSize: contract.lotSize,
    balance: balance.trim() === "" ? null : Number(balance),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field
          id="ps-lots"
          label="Lot size"
          value={lots}
          step={String(LOT_STEP)}
          onChange={(v) => {
            setLots(v);
            save(balance, v);
          }}
          hint={`${LOT_STEP} lot = ${qty(LOT_STEP * contract.lotSize)} ${contract.unit}`}
        />
        <Field
          id="ps-balance"
          label="Account balance ($)"
          value={balance}
          onChange={(v) => {
            setBalance(v);
            save(v, lots);
          }}
          hint="Optional: shows each as a % of it"
        />
        <Field id="ps-entry" label="Entry" value={entry} onChange={setEntry} />
        <Field id="ps-stop" label="Stop" value={stop} onChange={setStop} />
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        {!result ? (
          <p className="text-muted-foreground">Enter a lot size to see what the trade would risk.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-muted-foreground">
              {qty(Number(lots))} lots = {qty(result.units)} {contract.unit}
            </p>
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">If the stop is hit</span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                −{money(result.loss)}
                {result.lossPct !== null && <span className="ml-1 font-normal">({pct(result.lossPct)})</span>}
              </span>
            </p>
            {result.gain !== null && (
              <p className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">If the target is hit</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  +{money(result.gain)}
                  {result.gainPct !== null && <span className="ml-1 font-normal">({pct(result.gainPct)})</span>}
                </span>
              </p>
            )}
            {result.lossPct !== null && result.lossPct > HIGH_RISK_PCT && (
              <p className="border-t pt-1.5 text-xs text-destructive">
                That&apos;s {pct(result.lossPct)} of your account on one trade — most traders keep it to 1–2%.
                {Number(lots) <= LOT_STEP ? " Even the smallest lot is too big for this stop; consider skipping it." : " Try a smaller lot size."}
              </p>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Lot sizes follow Exness (1 lot = {contract.lotSize} {contract.unit}); check your broker&apos;s contract size.
        Spread and slippage are not included, and a fast market can fill past the stop. Not advice.
      </p>
    </div>
  );
}

interface PositionSizeDialogProps {
  symbol: string;
  entry: number;
  stop: number;
  target: number | null;
}

/** A small pill on a directional call that opens the calculator, filled in
 * with the call's entry and stop. */
export function PositionSizeDialog(props: PositionSizeDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
        >
          <Calculator className="size-3" aria-hidden />
          Position size
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Position size</DialogTitle>
          <DialogDescription>
            Enter the lot size you plan to trade {props.symbol} with to see what hitting the stop would lose and the
            target would make.
          </DialogDescription>
        </DialogHeader>
        <PositionSizeForm {...props} />
      </DialogContent>
    </Dialog>
  );
}
