"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { refreshMarketNewsCache } from "@/lib/actions/news";

export function RefreshMarketNewsButton() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await refreshMarketNewsCache();
            setDone(true);
          })
        }
      >
        {pending ? "Refreshing..." : "Refresh cached headlines now"}
      </Button>
      {done && !pending && <span className="text-xs text-muted-foreground">Done — reload the dashboard to see it.</span>}
    </div>
  );
}
