"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setLiveResultsEnabled } from "@/lib/actions/live-results-settings";

export function LiveResultsToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={(next) =>
          startTransition(async () => {
            await setLiveResultsEnabled(next);
          })
        }
        aria-label={enabled ? "Hide live results from users" : "Show live results to users"}
      />
      <span className="text-xs text-muted-foreground">{enabled ? "Visible to users" : "Hidden from users"}</span>
    </div>
  );
}
