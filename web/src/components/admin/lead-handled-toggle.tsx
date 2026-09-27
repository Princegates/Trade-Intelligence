"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { setLeadHandled } from "@/lib/actions/leads";

export function LeadHandledToggle({ leadId, handled }: { leadId: string; handled: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={handled}
        disabled={pending}
        onCheckedChange={(next) => startTransition(async () => { await setLeadHandled(leadId, next); })}
        aria-label={handled ? "Mark unhandled" : "Mark handled"}
      />
      {handled ? (
        <span className="text-xs text-muted-foreground">Handled</span>
      ) : (
        <Badge variant="warning">New</Badge>
      )}
    </div>
  );
}
