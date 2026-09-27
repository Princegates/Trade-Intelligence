"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestAccess, type LeadFormState } from "@/lib/actions/leads";

const initialState: LeadFormState = {};

/** Replaces what used to be a bare mailto: link on the pricing page's
 * "Full access" tier — same manual, admin-granted access underneath (see
 * migration 0026's own comment), but this leaves a record an admin can
 * work from instead of whatever lands in an inbox, and doesn't depend on
 * the visitor's mail client being configured. */
export function AccessRequestForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: LeadFormState, formData: FormData) => {
    const result = await requestAccess(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initialState);

  if (state.success) {
    return <p className="text-sm text-muted-foreground">Thanks — we&apos;ll be in touch about renewing your access.</p>;
  }

  return (
    <form ref={formRef} action={formAction} className="w-full space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="access-request-email" className="sr-only">
          Email
        </Label>
        <Input id="access-request-email" name="email" type="email" placeholder="you@example.com" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="access-request-note" className="sr-only">
          What would you like access to? (optional)
        </Label>
        <Input id="access-request-note" name="note" placeholder="What would you like access to? (optional)" />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending..." : "Request access"}
      </Button>
    </form>
  );
}
