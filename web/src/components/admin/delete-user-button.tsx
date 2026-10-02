"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { deleteUser } from "@/lib/actions/users";

/** Permanently removes someone's account — a confirmation dialog in front
 * of a destructive action, not a single click, since there is no recovery
 * once it's confirmed (see deleteUser's own docstring for what cascades
 * with it). `isSelf` disables the button entirely rather than just failing
 * on click — the server action also refuses it, this just saves the round
 * trip and makes the reason visible without opening the dialog first. */
export function DeleteUserButton({ userId, name, isSelf = false }: { userId: string; name: string; isSelf?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={isSelf}
        title={isSelf ? "You can't delete your own account while signed in as it" : undefined}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
        Delete
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}&apos;s account?</DialogTitle>
            <DialogDescription>
              This permanently removes their login, profile, and any unredeemed access codes. There is no recovery
              — it cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending ? "Deleting..." : "Delete permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
