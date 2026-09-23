"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { setUserApproval } from "@/lib/actions/users";

export function ApprovalToggle({ userId, approved }: { userId: string; approved: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={approved}
        disabled={pending}
        onCheckedChange={(next) =>
          startTransition(async () => {
            await setUserApproval(userId, next);
          })
        }
        aria-label={approved ? "Revoke access" : "Approve access"}
      />
      {approved ? (
        <span className="text-xs text-muted-foreground">Approved</span>
      ) : (
        <Badge variant="warning">Pending</Badge>
      )}
    </div>
  );
}
