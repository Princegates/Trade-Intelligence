"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Tuned so a typical 2-4 sentence commentary (roughly 40-70 words) finishes
// revealing in a couple of seconds — quick enough not to feel like a delay,
// slow enough to actually read as "being written," not just a flicker.
const REVEAL_WORD_INTERVAL_MS = 35;
// Most of the balloon inflate (0.7s, ai-take-balloon-grow in globals.css) —
// the words start once the box is nearly full size, not while it's a speck.
const REVEAL_START_DELAY_MS = 550;
// max-w-lg on DialogContent: the dialog's width wherever the viewport allows.
const DIALOG_MAX_WIDTH_PX = 512;

/** Reveals `text` one word at a time, starting shortly after it mounts. Purely
 * a presentation effect signaling "this was AI-written" — the commentary is
 * already fully generated and stored by the time this renders (see
 * src/ai/commentary.py), there's no real stream to show. A separate
 * component (not inline state in AiTakeDialog below) specifically so it
 * remounts fresh — and the reveal replays from the start — every time the
 * dialog re-opens: Radix's DialogContent unmounts its children on close. */
function RevealingCommentary({ text }: { text: string }) {
  const words = text.split(" ");
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= words.length) return;
    const delay = shown === 0 ? REVEAL_START_DELAY_MS : REVEAL_WORD_INTERVAL_MS;
    const id = setTimeout(() => setShown((n) => n + 1), delay);
    return () => clearTimeout(id);
  }, [shown, words.length]);

  return (
    <div className="relative">
      {/* Invisible sizer at the full, final text — reserves the dialog's
          real height immediately on mount, so the box doesn't visibly grow
          taller over the ~2s the words take to reveal (it has no fixed
          height otherwise, and being vertically centered, a growing box
          expands outward in both directions). Same text, same classes, so
          it wraps to the same line count the revealed copy will. */}
      <p className="invisible text-sm leading-relaxed" aria-hidden="true">
        {text}
      </p>
      <p className="absolute inset-0 text-sm leading-relaxed text-foreground">
        {words.slice(0, shown).join(" ")}
        {shown < words.length && (
          <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-primary/70 align-middle" />
        )}
      </p>
    </div>
  );
}

/** Collapsed by default — a small pill that opens the full AI commentary in
 * a dialog rather than taking up permanent space on every card. The
 * commentary itself is additive color on top of the verdict above, never a
 * second opinion, which the dialog says explicitly rather than assuming
 * that's obvious out of context. */
export function AiTakeDialog({ commentary, symbol, timeframe }: { commentary: string; symbol: string; timeframe: string }) {
  const pillRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<CSSProperties>({});

  // Re-measured on close as well as open, so the dialog deflates into the
  // pill wherever it is right then (a resize or rotate while it was open).
  function handleOpenChange(next: boolean) {
    setOrigin(pillOrigin(pillRef.current));
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          ref={pillRef}
          type="button"
          className="relative mb-3 inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
        >
          {/* The swoosh: a streak that draws in toward the sparkle, which
              pops as it lands — see .ai-take-trail/.ai-take-sparkle in
              globals.css. */}
          <svg className="ai-take-trail" viewBox="0 0 30 26" aria-hidden="true">
            <path d="M2 22 Q 14 26, 26 17" />
          </svg>
          <Sparkles className="ai-take-sparkle size-3" />
          AI take
        </button>
      </DialogTrigger>
      <DialogContent className="ai-take-content" overlayClassName="ai-take-overlay" style={origin}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" />
            AI take — {symbol} {timeframe}
          </DialogTitle>
          <DialogDescription>
            Additional color from an LLM, on top of the verdict above — not a second opinion, not financial advice.
          </DialogDescription>
        </DialogHeader>
        <RevealingCommentary text={commentary} />
      </DialogContent>
    </Dialog>
  );
}


/** Where the balloon inflates from and deflates back into: the pill's center
 * as an offset from the viewport center (where the dialog sits), and the
 * scale at which the dialog is about the pill's width. Read by the
 * ai-take-balloon-* keyframes in globals.css. */
function pillOrigin(pill: HTMLElement | null): CSSProperties {
  if (!pill) return {};
  const r = pill.getBoundingClientRect();
  const dialogWidth = Math.min(DIALOG_MAX_WIDTH_PX, window.innerWidth);
  return {
    "--ai-take-dx": `${r.left + r.width / 2 - window.innerWidth / 2}px`,
    "--ai-take-dy": `${r.top + r.height / 2 - window.innerHeight / 2}px`,
    "--ai-take-scale": String(Math.max(0.05, r.width / dialogWidth)),
  } as CSSProperties;
}
