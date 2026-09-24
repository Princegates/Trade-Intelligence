"use server";

import { requireUser } from "@/lib/auth";
import { hasFullAccess } from "@/lib/access";
import { getActiveAiProvider } from "@/lib/ai-settings";
import { getLatestSignals } from "@/lib/signals";
import { formatSignalsForChat } from "@/lib/signal-view";
import { generateChatReply, type ChatTurn } from "@/lib/gemini-chat";

export interface ChatResult {
  reply?: string;
  error?: string;
}

/** Guda, the chat assistant — full-access only (see /admin/users and the
 * trial-access migration). DashboardShell already hides the widget for a
 * basic-view user, but this is the actual enforcement: hiding a button
 * doesn't stop a direct call to this action, so it's re-checked here too,
 * not restricted to questions about signals otherwise.
 *
 * Fetches the current signals fresh on every message (not cached), so the
 * assistant is always answering from whatever's actually on the dashboard
 * right now, not a stale snapshot from earlier in the conversation. */
export async function sendChatMessage(history: ChatTurn[], message: string): Promise<ChatResult> {
  const user = await requireUser();
  if (!hasFullAccess(user)) {
    return { error: "Guda is a full-access feature — ask your admin for an access code to unlock it." };
  }

  const trimmed = message.trim();
  if (!trimmed) return { error: "Type a message first." };

  const provider = await getActiveAiProvider();
  if (!provider) {
    return { error: "No AI provider is configured yet — ask your admin to set one up in Settings." };
  }

  const { signals } = await getLatestSignals();
  const dataContext = formatSignalsForChat(signals);

  const reply = await generateChatReply(history, trimmed, provider, dataContext);
  if (!reply) return { error: "The assistant didn't respond — try again in a moment." };

  return { reply };
}
