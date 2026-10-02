"use client";

import { useState, useTransition } from "react";
import { KeyRound, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { generateAccessCode } from "@/lib/actions/users";

/** Generates a one-time unlock code for a specific person and shows it once
 * so the admin can copy it and send it out of band — the app never displays
 * anyone's code again after this dialog closes (see 0011_trial_access.sql:
 * there is no stored plaintext to look up later). The code is also emailed
 * directly to the person (best-effort — see notifyUserOfAccessCode), so the
 * copy/send-manually flow is a fallback, not the only path.
 *
 * Opens in a two-step dialog rather than generating immediately: first the
 * admin picks how many days of full access this specific code should grant
 * (prefilled from the site's default trial length), then the code itself is
 * shown once it's generated. */
export function AccessCodeButton({ userId, name, defaultDays }: { userId: string; name: string; defaultDays: number }) {
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState(String(defaultDays));
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  function handleGenerate() {
    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365) {
      setError("Enter a whole number of days between 1 and 365.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await generateAccessCode(userId, parsedDays);
      if (result.error) {
        setError(result.error);
      } else if (result.code) {
        setCode(result.code);
        setExpiresAt(result.expiresAt ?? null);
        setEmailSent(result.emailSent ?? false);
      }
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
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound className="size-3.5" />
        Generate code
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setCode(null);
            setExpiresAt(null);
            setEmailSent(false);
            setError(null);
            setCopied(false);
            setDays(String(defaultDays));
          }
        }}
      >
        <DialogContent>
          {code ? (
            <>
              <DialogHeader>
                <DialogTitle>Access code for {name}</DialogTitle>
                <DialogDescription>
                  {emailSent
                    ? `Emailed to ${name} — also shown here in case you want to send it yourself. It won't be shown again.`
                    : "Couldn't email this automatically — copy it and send it to them yourself. It won't be shown again."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-center text-lg font-semibold tracking-widest">
                    {code}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Grants full access for {days} day{days === "1" ? "" : "s"} once redeemed.</p>
                {expiresAt && (
                  <p className="text-xs text-muted-foreground">
                    Expires {new Date(expiresAt).toLocaleString()} if not redeemed before then.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Access code for {name}</DialogTitle>
                <DialogDescription>
                  {error || "How many days of full access should this code grant once they redeem it?"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="access-code-days">Days of access</Label>
                <Input
                  id="access-code-days"
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="button" disabled={pending} onClick={handleGenerate}>
                  {pending ? "Generating..." : "Generate"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
