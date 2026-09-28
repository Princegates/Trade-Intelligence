"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setBacktestOddsEnabled, setLiveResultsEnabled } from "@/lib/actions/live-results-settings";

const SETTERS = {
  live: { set: setLiveResultsEnabled, what: "live results" },
  odds: { set: setBacktestOddsEnabled, what: "backtest odds" },
};

export function LiveResultsToggle({ enabled, setting = "live" }: { enabled: boolean; setting?: keyof typeof SETTERS }) {
  const [pending, startTransition] = useTransition();
  const { set, what } = SETTERS[setting];

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={(next) =>
          startTransition(async () => {
            await set(next);
          })
        }
        aria-label={enabled ? `Hide ${what} from users` : `Show ${what} to users`}
      />
      <span className="text-xs text-muted-foreground">{enabled ? "Visible to users" : "Hidden from users"}</span>
    </div>
  );
}
