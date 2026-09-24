"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMascot } from "@/components/chat/chat-mascot";
import { sendChatMessage } from "@/lib/actions/chat";
import type { ChatTurn } from "@/lib/gemini-chat";

const STORAGE_KEY = "ti-chat-fab-pos";
const FAB_SIZE = 96; // px — matches the size-24 button below
const PANEL_WIDTH = 352; // 22rem
const PANEL_HEIGHT = 448; // 28rem
const MARGIN = 16;
const DRAG_THRESHOLD = 6; // px of movement before a pointer-down counts as a drag, not a click

interface Point {
  x: number;
  y: number;
}

function clampToViewport(pos: Point): Point {
  const maxX = Math.max(MARGIN, window.innerWidth - FAB_SIZE - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - FAB_SIZE - MARGIN);
  return { x: Math.min(Math.max(pos.x, MARGIN), maxX), y: Math.min(Math.max(pos.y, MARGIN), maxY) };
}

function defaultPosition(): Point {
  return clampToViewport({ x: window.innerWidth - FAB_SIZE - MARGIN, y: window.innerHeight - FAB_SIZE - MARGIN });
}

/** Where the panel opens relative to the FAB's current spot: above and
 * right-aligned to it by default, flipping to whichever side actually has
 * room once the FAB has been dragged near an edge — it should never open
 * partly off-screen just because the bubble was moved into a corner. */
function panelPosition(fab: Point): Point {
  const spaceAbove = fab.y - MARGIN;
  const y = spaceAbove >= PANEL_HEIGHT ? fab.y - PANEL_HEIGHT - 12 : Math.min(fab.y + FAB_SIZE + 12, window.innerHeight - PANEL_HEIGHT - MARGIN);
  const preferredX = fab.x + FAB_SIZE - PANEL_WIDTH;
  const x = Math.min(Math.max(preferredX, MARGIN), window.innerWidth - PANEL_WIDTH - MARGIN);
  return { x, y: Math.max(MARGIN, y) };
}

/** A floating, draggable assistant available on every dashboard/admin page
 * — not restricted to questions about the displayed signal, not gated by
 * trial status, no per-message cap. Chat history lives in this component's
 * state only (nothing persisted), so it survives client-side navigation
 * within the dashboard shell but resets on a full reload. Its on-screen
 * position, however, is saved to localStorage — a per-viewer convenience,
 * not app state — so it stays wherever a person last dragged it. */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  useEffect(() => {
    let initial: Point | null = null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) initial = clampToViewport(JSON.parse(saved));
    } catch {
      // Private browsing / blocked storage — falls through to the default corner.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPos(initial ?? defaultPosition());

    const onResize = () => setPos((p) => (p ? clampToViewport(p) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!pos) return;
      dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pos]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      drag.moved = true;
      setDragging(true);
    }
    if (drag.moved) {
      setPos(clampToViewport({ x: drag.origX + dx, y: drag.origY + dy }));
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    const drag = dragState.current;
    dragState.current = null;
    setDragging(false);

    if (drag?.moved) {
      // A real drag ended — save the new spot, don't toggle the panel.
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
          } catch {
            // Ignore — the position just won't persist across reloads.
          }
        }
        return p;
      });
      return;
    }
    // No meaningful movement — treat it as a click.
    setOpen((v) => !v);
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    setError(null);
    setInput("");
    const next = [...messages, { role: "user" as const, text }];
    setMessages(next);
    setPending(true);

    const result = await sendChatMessage(messages, text);

    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.reply) {
      setMessages([...next, { role: "assistant", text: result.reply }]);
    }
  }

  const invitePulse = !open && messages.length === 0;

  // Before the first client-side effect runs, pos is null — render nothing
  // rather than guess a position from server-rendered (window-less) markup.
  if (!pos) return null;

  const panel = open ? panelPosition(pos) : null;

  return (
    <>
      {panel && (
        <div
          className="chat-panel-enter fixed z-40 flex origin-bottom-right flex-col rounded-lg border border-border bg-card shadow-xl"
          style={{ left: panel.x, top: panel.y, width: PANEL_WIDTH, height: PANEL_HEIGHT }}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bot className="chat-bot-icon size-4 text-primary" />
              Assistant
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <X className="size-4 transition-transform duration-200 hover:rotate-90" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <p className="chat-bubble-enter text-sm text-muted-foreground">
                Ask me anything — about your signals or anything else.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "chat-bubble-enter ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "chat-bubble-enter mr-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
                }
              >
                {m.text}
              </div>
            ))}
            {pending && (
              <div className="chat-bubble-enter mr-auto flex items-center gap-1 rounded-lg bg-muted px-3 py-2.5">
                <span className="chat-typing-dot size-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: "0ms" }} />
                <span className="chat-typing-dot size-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
                <span className="chat-typing-dot size-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
              </div>
            )}
            {error && <p className="chat-bubble-enter text-sm text-destructive">{error}</p>}
          </div>

          <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border p-2.5">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              disabled={pending}
              className="h-9 transition-shadow"
            />
            <Button
              type="submit"
              size="sm"
              disabled={pending || !input.trim()}
              className="transition-transform active:scale-90"
            >
              <Send className="size-3.5" />
            </Button>
          </form>
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={`fixed z-40 size-24 touch-none rounded-full bg-transparent transition-transform duration-200 hover:bg-transparent active:scale-95 ${
          dragging ? "cursor-grabbing" : "cursor-grab hover:scale-110"
        } ${invitePulse && !dragging ? "chat-fab-idle" : ""}`}
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label={open ? "Close assistant" : "Open assistant — drag to move"}
      >
        <ChatMascot open={open} />
      </Button>
    </>
  );
}
