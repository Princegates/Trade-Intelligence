"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, type ProfileFormState } from "@/lib/actions/profile";

const initialState: ProfileFormState = {};

type PasswordAction = (prev: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;

/** `action` defaults to the normal self-service change (updatePassword) —
 * /change-password passes changeForcedPassword instead, which redirects to
 * /dashboard on success rather than returning {success:true}, so this
 * component never needs to know which flow it's in beyond that prop. */
export function PasswordForm({ action = updatePassword, currentPasswordLabel = "Current password" }: {
  action?: PasswordAction;
  currentPasswordLabel?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ProfileFormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.success) formRef.current?.reset();
    return result;
  }, initialState);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">{currentPasswordLabel}</Label>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Password updated.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}
