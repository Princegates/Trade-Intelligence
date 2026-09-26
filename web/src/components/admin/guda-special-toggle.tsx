"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setGudaSpecialEnabled } from "@/lib/actions/guda-special-settings";

export function GudaSpecialToggle({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={(next) =>
          startTransition(async () => {
            await setGudaSpecialEnabled(next);
          })
        }
        aria-label={enabled ? "Hide GUDA SPECIAL from users" : "Show GUDA SPECIAL to users"}
      />
      <span className="text-xs text-muted-foreground">{enabled ? "Visible to users" : "Hidden from users"}</span>
    </div>
  );
}
