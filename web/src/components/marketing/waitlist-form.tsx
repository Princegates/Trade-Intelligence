"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinWaitlist, type LeadFormState } from "@/lib/actions/leads";

const initialState: LeadFormState = {};

/** A lower-commitment path than "create an account" for a visitor who's
 * interested but not ready — just an email, saved to the same leads table
 * the pricing page's access-request form uses (see migration 0026). */
export function WaitlistForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: LeadFormState, formData: FormData) => {
    const result = await joinWaitlist(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initialState);

  if (state.success) {
    return <p className="text-sm text-muted-foreground">You&apos;re on the list — we&apos;ll be in touch.</p>;
  }

  return (
    <form ref={formRef} action={formAction} className="mx-auto max-w-sm space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Label htmlFor="waitlist-email" className="sr-only">
          Email
        </Label>
        <Input id="waitlist-email" name="email" type="email" placeholder="you@example.com" required className="flex-1" />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Joining..." : "Join waitlist"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
