import "server-only";
import type { AiProvider } from "@/lib/ai-settings";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const MAX_OUTPUT_TOKENS = 1024;
// Trims the payload sent on every turn, not the conversation the user sees —
// the widget itself keeps the full history on screen.
const MAX_HISTORY_TURNS = 30;

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

// The one guardrail kept regardless: consistent with the "Not financial
// advice" disclaimer already on every page of the site (see
// /disclaimer), not a restriction on what the assistant can talk about.
const SYSTEM_INSTRUCTION =
  "You are the assistant built into SignalsVault AI, a BTC/gold trading-signals dashboard. " +
  "You can discuss anything the user asks. You are not a licensed financial advisor, so don't " +
  "represent yourself as one or claim certainty about future price moves — beyond that, answer " +
  "freely and helpfully.";

/** Calls Gemini's chat-style generateContent with the running history plus
 * a new message. Returns the reply text, or null on any failure — a
 * provider outage should read as "try again," never crash the page. */
export async function generateChatReply(
  history: ChatTurn[],
  message: string,
  provider: AiProvider
): Promise<string | null> {
  if (provider.provider !== "gemini") return null;
  const apiKey = provider.config.api_key;
  if (!apiKey) return null;
  const model = provider.config.model || DEFAULT_MODEL;

  const trimmedHistory = history.slice(-MAX_HISTORY_TURNS);
  const contents = [
    ...trimmedHistory.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.6 },
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!response.ok) {
      // Logged, not surfaced to the browser — the most common causes are an
      // invalid API key (400/403), a model name Gemini doesn't recognize
      // (404), or the free tier's rate limit (429). Check Vercel's function
      // logs for this line to tell which one it actually was.
      const body = await response.text().catch(() => "");
      console.error(`[gemini-chat] ${response.status} ${response.statusText}: ${body.slice(0, 500)}`);
      return null;
    }

    const data = await response.json();
    const text: unknown = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      // A 200 with no usable text is almost always Gemini's safety filter
      // blocking the prompt or the reply, not a code bug — surfaced here so
      // it's distinguishable from every other failure mode above.
      console.error(
        `[gemini-chat] no text in response — blockReason=${data?.promptFeedback?.blockReason} finishReason=${data?.candidates?.[0]?.finishReason}`
      );
      return null;
    }
    const trimmed = text.trim();
    return trimmed || null;
  } catch (exc) {
    console.error(`[gemini-chat] request failed: ${exc}`);
    return null;
  }
}
