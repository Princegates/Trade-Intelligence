"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAccessPolicy, type AccessPolicyFormState } from "@/lib/actions/access";

const initialState: AccessPolicyFormState = {};

export function AccessPolicyForm({ trialDays, codeExpiryDays }: { trialDays: number; codeExpiryDays: number }) {
  const [trialValue, setTrialValue] = useState(String(trialDays));
  const [expiryValue, setExpiryValue] = useState(String(codeExpiryDays));
  const [state, formAction, pending] = useActionState(setAccessPolicy, initialState);

  const unchanged = trialValue === String(trialDays) && expiryValue === String(codeExpiryDays);

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
          value={trialValue}
          onChange={(e) => setTrialValue(e.target.value)}
          className="max-w-32"
          required
        />
        <p className="text-xs text-muted-foreground">
          How long a newly-approved account (or a redeemed access code) grants full trade history before it drops
          back to the basic view.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="codeExpiryDays">Access code expiry (days)</Label>
        <Input
          id="codeExpiryDays"
          name="codeExpiryDays"
          type="number"
          min={1}
          max={365}
          value={expiryValue}
          onChange={(e) => setExpiryValue(e.target.value)}
          className="max-w-32"
          required
        />
        <p className="text-xs text-muted-foreground">
          How long a generated access code itself stays redeemable, starting from when you generate it — not how
          long access lasts once someone redeems it. Once a code expires unredeemed, you&apos;ll need to generate a
          new one for that person.
        </p>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}

      <Button type="submit" disabled={pending || unchanged}>
        {pending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
