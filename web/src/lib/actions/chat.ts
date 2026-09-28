"use server";

import { requireUser } from "@/lib/auth";
import { hasFullAccess } from "@/lib/access";
import { getActiveAiProvider } from "@/lib/ai-settings";
import { getLatestSignals } from "@/lib/signals";
import { formatSignalsForChat } from "@/lib/signal-view";
import { generateChatReply, type ChatTurn } from "@/lib/gemini-chat";
import { createServiceClient } from "@/lib/supabase/service";

export interface ChatResult {
  reply?: string;
  error?: string;
}

// Each message is a billed call to the configured AI provider, and nothing
// upstream of this action limited how many a full-access user could send —
// back-to-back as fast as replies came back, uncapped. 20 messages per 10
// minutes is generous for an actual conversation, but bounds the cost of
// one user (or one compromised session) hammering the endpoint.
const MAX_MESSAGES_PER_WINDOW = 20;
const RATE_LIMIT_WINDOW_SECONDS = 600;

/** Checked and incremented atomically in Postgres (see
 * supabase/migrations/0024_chat_rate_limit.sql#chat_rate_limit_check) so two
 * concurrent sends from the same user can't both slip through on a stale
 * read. Reads through the service-role client since chat_rate_limit is
 * RLS-locked to that function/key on purpose (see the migration).
 *
 * Fails open — a missing service-role key or an RPC error (e.g. the
 * migration hasn't been applied to this project yet) allows the message
 * through rather than breaking the chat feature over the rate limiter
 * itself. */
async function withinChatRateLimit(userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  if (!supabase) return true;

  const { data, error } = await supabase.rpc("chat_rate_limit_check", {
    uid: userId,
    max_per_window: MAX_MESSAGES_PER_WINDOW,
    window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });

  if (error) {
    console.error(`[chat-rate-limit] ${error.message}`);
    return true;
  }
  return data === true;
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

  if (!(await withinChatRateLimit(user.id))) {
    return {
      error: `Guda's had a lot of messages from you in the last ${Math.round(RATE_LIMIT_WINDOW_SECONDS / 60)} minutes — try again shortly.`,
    };
  }

  const provider = await getActiveAiProvider();
  if (!provider) {
    return { error: "No AI provider is configured yet — ask your admin to set one up in Settings." };
  }

  const { signals } = await getLatestSignals();
  const dataContext = formatSignalsForChat(signals);

  const { reply, rateLimited } = await generateChatReply(history, trimmed, provider, dataContext);
  if (!reply) {
    return {
      error: rateLimited
        ? "Guda's AI provider has hit its rate limit — try again in a minute."
        : "The assistant didn't respond — try again in a moment.",
    };
  }

  return { reply };
}
