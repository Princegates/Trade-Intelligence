"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTRACTS, LOT_STEP, positionSize } from "@/lib/position-size";

// Balance and risk % are remembered in this browser only, as a convenience.
const STORAGE_KEY = "position-size:v1";
const DEFAULT_RISK_PCT = "1";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
// A price as an editable field value: cents, without float noise like 2338.2401999999.
const priceField = (n: number) => String(Number(n.toFixed(2)));

function readSaved(): { balance: string; riskPct: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      balance: typeof saved.balance === "string" ? saved.balance : "",
      riskPct: typeof saved.riskPct === "string" ? saved.riskPct : DEFAULT_RISK_PCT,
    };
  } catch {
    return { balance: "", riskPct: DEFAULT_RISK_PCT };
  }
}

function save(balance: string, riskPct: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ balance, riskPct }));
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} type="number" inputMode="decimal" min="0" step="any" value={value} onChange={(e) => onChange(e.target.value)} />
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
  const [balance, setBalance] = useState(saved.balance);
  const [riskPct, setRiskPct] = useState(saved.riskPct);
  const [entry, setEntry] = useState(priceField(calledEntry));
  const [stop, setStop] = useState(priceField(calledStop));

  const result = positionSize({
    balance: Number(balance),
    riskPct: Number(riskPct),
    entry: Number(entry),
    stop: Number(stop),
    target,
    lotSize: contract.lotSize,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field
          id="ps-balance"
          label="Account balance ($)"
          value={balance}
          onChange={(v) => {
            setBalance(v);
            save(v, riskPct);
          }}
        />
        <Field
          id="ps-risk"
          label="Risk per trade (%)"
          value={riskPct}
          onChange={(v) => {
            setRiskPct(v);
            save(balance, v);
          }}
          hint="1–2% is a common ceiling"
        />
        <Field id="ps-entry" label="Entry" value={entry} onChange={setEntry} />
        <Field id="ps-stop" label="Stop" value={stop} onChange={setStop} />
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        {!result ? (
          <p className="text-muted-foreground">Enter your account balance to see a position size.</p>
        ) : result.lots === 0 ? (
          <p className="text-foreground">
            Too small for the minimum {LOT_STEP} lot, which would risk {money(result.minLotRisk)} on this stop —{" "}
            {((result.minLotRisk / Number(balance)) * 100).toFixed(1)}% of your account. Consider skipping this one.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              {result.lots.toFixed(2)} lots{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({qty(result.lots * contract.lotSize)} {contract.unit})
              </span>
            </p>
            <p className="text-muted-foreground">
              If the stop is hit: <span className="font-medium text-foreground">−{money(result.lotsRisk)}</span>
              {result.lotsReward !== null && (
                <>
                  {" · "}If the target is hit:{" "}
                  <span className="font-medium text-foreground">+{money(result.lotsReward)}</span>
                </>
              )}
            </p>
            {result.lotsRisk < result.riskAmount - 0.005 && (
              <p className="text-[11px] text-muted-foreground">
                Rounded down from {qty(result.units)} {contract.unit} to whole {LOT_STEP} lots, so the risk stays under{" "}
                {money(result.riskAmount)}.
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
            How big to trade {props.symbol} so that hitting the stop loses only the share of your account you choose.
          </DialogDescription>
        </DialogHeader>
        <PositionSizeForm {...props} />
      </DialogContent>
    </Dialog>
  );
}
