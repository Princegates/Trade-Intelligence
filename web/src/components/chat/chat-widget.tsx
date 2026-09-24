"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMascot } from "@/components/chat/chat-mascot";
import { sendChatMessage } from "@/lib/actions/chat";
import type { ChatTurn } from "@/lib/gemini-chat";

/** A floating assistant available on every dashboard/admin page — not
 * restricted to questions about the displayed signal, not gated by trial
 * status, no per-message cap. History lives in this component's state only
 * (nothing persisted), so it survives client-side navigation within the
 * dashboard shell but resets on a full reload. */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

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

  return (
    <div className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      {open && (
        <div className="chat-panel-enter mb-3 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2rem)] origin-bottom-right flex-col rounded-lg border border-border bg-card shadow-xl">
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
        className={`size-20 rounded-full bg-transparent transition-transform duration-200 hover:scale-110 hover:bg-transparent active:scale-90 ${invitePulse ? "chat-fab-idle" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        <ChatMascot open={open} />
      </Button>
    </div>
  );
}
