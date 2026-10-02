"use client";

import { useState, useTransition } from "react";
import { RotateCcw, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { resetUserPassword } from "@/lib/actions/users";

/** Sets a random temporary password for someone's account and shows it once
 * so the admin can copy it and send it out of band — same "never shown
 * again after this dialog closes" shape as AccessCodeButton, since there's
 * no stored plaintext to look up later. The account is forced through a
 * password change on its next login (see /change-password); this button
 * doesn't do anything else to the account itself. */
export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  function handleReset() {
    setError(null);
    startTransition(async () => {
      const result = await resetUserPassword(userId);
      if (result.error) {
        setError(result.error);
      } else if (result.temporaryPassword) {
        setPassword(result.temporaryPassword);
      }
      setOpen(true);
    });
  }

  function handleCopy() {
    if (!password) return;
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleReset}>
        <RotateCcw className="size-3.5" />
        {pending ? "Resetting..." : "Reset password"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setPassword(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password for {name}</DialogTitle>
            <DialogDescription>
              {error
                ? error
                : "Send this to them yourself — it won't be shown again. They'll be asked to set their own password the moment they sign in with it."}
            </DialogDescription>
          </DialogHeader>
          {password && (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-center text-lg font-semibold tracking-wide">
                {password}
              </code>
              <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
