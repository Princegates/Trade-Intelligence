"use client";

import { useState, useTransition } from "react";
import { KeyRound, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { generateAccessCode } from "@/lib/actions/users";

/** Generates a one-time unlock code for a specific person and shows it once
 * so the admin can copy it and send it out of band — the app never displays
 * anyone's code again after this dialog closes (see 0011_trial_access.sql:
 * there is no stored plaintext to look up later). */
export function AccessCodeButton({ userId, name }: { userId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateAccessCode(userId);
      if (result.error) {
        setError(result.error);
      } else if (result.code) {
        setCode(result.code);
      }
      setOpen(true);
    });
  }

  function handleCopy() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleGenerate}>
        <KeyRound className="size-3.5" />
        {pending ? "Generating..." : "Generate code"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setCode(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Access code for {name}</DialogTitle>
            <DialogDescription>
              {error
                ? error
                : "Send this to them yourself — it won't be shown again. It only unlocks full access for this account."}
            </DialogDescription>
          </DialogHeader>
          {code && (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-center text-lg font-semibold tracking-widest">
                {code}
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
