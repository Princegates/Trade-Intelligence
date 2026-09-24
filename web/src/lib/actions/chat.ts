"use server";

import { requireUser } from "@/lib/auth";
import { getActiveAiProvider } from "@/lib/ai-settings";
import { generateChatReply, type ChatTurn } from "@/lib/gemini-chat";

export interface ChatResult {
  reply?: string;
  error?: string;
}

/** Available to every signed-in, approved user (or admin) — not limited by
 * trial/basic-view status, not restricted to questions about signals. */
export async function sendChatMessage(history: ChatTurn[], message: string): Promise<ChatResult> {
  await requireUser();

  const trimmed = message.trim();
  if (!trimmed) return { error: "Type a message first." };

  const provider = await getActiveAiProvider();
  if (!provider) {
    return { error: "No AI provider is configured yet — ask your admin to set one up in Settings." };
  }

  const reply = await generateChatReply(history, trimmed, provider);
  if (!reply) return { error: "The assistant didn't respond — try again in a moment." };

  return { reply };
}
