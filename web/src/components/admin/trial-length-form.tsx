"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAccessPolicy, type AccessPolicyFormState } from "@/lib/actions/access";

const initialState: AccessPolicyFormState = {};

export function TrialLengthForm({ trialDays }: { trialDays: number }) {
  const [value, setValue] = useState(String(trialDays));
  const [state, formAction, pending] = useActionState(setAccessPolicy, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="trialDays">Trial length (days)</Label>
        <Input
          id="trialDays"
          name="trialDays"
          type="number"
          min={1}
          max={365}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-32"
          required
        />
        <p className="text-xs text-muted-foreground">
          How long a newly-approved account (or a redeemed access code) grants full trade history before it drops
          back to the basic view.
        </p>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}

      <Button type="submit" disabled={pending || value === String(trialDays)}>
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
