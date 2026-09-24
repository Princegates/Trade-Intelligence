"use client";

import { Sparkles } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/** Collapsed by default — a small pill that opens the full AI commentary in
 * a dialog rather than taking up permanent space on every card. The
 * commentary itself is additive color on top of the verdict above, never a
 * second opinion, which the dialog says explicitly rather than assuming
 * that's obvious out of context. */
export function AiTakeDialog({ commentary, symbol, timeframe }: { commentary: string; symbol: string; timeframe: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
        >
          <Sparkles className="size-3" />
          AI take
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" />
            AI take — {symbol} {timeframe}
          </DialogTitle>
          <DialogDescription>
            Additional color from an LLM, on top of the verdict above — not a second opinion, not financial advice.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-foreground">{commentary}</p>
      </DialogContent>
    </Dialog>
  );
}
