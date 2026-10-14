"use client";

// A visitor's choice about the one non-essential cookie we set (ti-mode)
// and the localStorage conveniences documented in /cookie-policy (sidebar
// pin state, the Guda chat bubble's position, the position-size
// calculator's last inputs, the economic-calendar card's collapsed state).
// The strictly-necessary Supabase auth cookie is never gated by this —
// it's required for the sign-in you explicitly requested, the same reason
// it doesn't need a consent banner in the first place.

const CONSENT_COOKIE = "ti-cookie-consent"; // "all" | "necessary"
const CONSENT_EVENT = "ti-cookie-consent-change";

export type ConsentChoice = "all" | "necessary";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

/** The visitor's recorded choice, or null if they haven't been asked yet
 * (or the cookie's value doesn't parse as one of the two choices — treated
 * the same as not-yet-asked, so the banner shows again rather than
 * silently assuming either answer). */
export function getConsent(): ConsentChoice | null {
  const v = readCookie(CONSENT_COOKIE);
  return v === "all" || v === "necessary" ? v : null;
}

export function setConsent(choice: ConsentChoice) {
  writeCookie(CONSENT_COOKIE, choice);
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** Whether the ti-mode cookie and the localStorage conveniences may be
 * *written*. Defaults to false — not yet decided, or declined — the safe
 * default until a choice is recorded, same "deny until proven otherwise"
 * reasoning this app already applies elsewhere (e.g. getSessionUser()'s
 * no-profile-row-means-unapproved default). Reading an already-existing
 * cookie/localStorage value (e.g. set before this banner existed) is never
 * gated by this — only writing a new one is. */
export function hasNonEssentialConsent(): boolean {
  return getConsent() === "all";
}

/** Notifies already-mounted components the moment the visitor answers the
 * banner, so a component that read consent once on mount (e.g.
 * ModeProvider) can react immediately instead of waiting for a reload. */
export function onConsentChange(cb: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, cb);
  return () => window.removeEventListener(CONSENT_EVENT, cb);
}
