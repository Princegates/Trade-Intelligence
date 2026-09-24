"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redeemAccessCode, type RedeemFormState } from "@/lib/actions/access";

const initialState: RedeemFormState = {};

export function RedeemCodeForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: RedeemFormState, formData: FormData) => {
    const result = await redeemAccessCode(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initialState);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code">Access code</Label>
        <Input id="code" name="code" placeholder="XXXX-XXXX" autoComplete="off" required className="uppercase" />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Unlocked — full access extended.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Redeeming..." : "Redeem code"}
      </Button>
    </form>
  );
}
