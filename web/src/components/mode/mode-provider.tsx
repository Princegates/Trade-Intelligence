"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { MODE_COOKIE, isMode, type Mode } from "@/lib/themes";
import { hasNonEssentialConsent, onConsentChange } from "@/lib/cookie-consent";

interface ModeContextValue {
  mode: Mode;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

/** `defaultMode` is the admin's site-wide default (site_appearance.mode) —
 * what a visitor sees until they pick their own via ModeToggle, after
 * which their choice (a cookie) always wins over the admin's default. */
export function ModeProvider({ defaultMode, children }: { defaultMode: Mode; children: ReactNode }) {
  // Always start from the same default the server rendered — the server
  // doesn't read this visitor's cookie (see app/layout.tsx), so reading it
  // here on the client's first render would make that render disagree with
  // the server's and crash hydration. The real value is applied
  // synchronously before paint in the layout effect below instead — the
  // same trick mode-script.tsx uses for the data-mode DOM attribute.
  const [mode, setModeState] = useState<Mode>(defaultMode);

  const applyMode = (next: Mode) => {
    setModeState(next);
    // ti-mode is the one non-essential cookie this app sets (see
    // /cookie-policy) — only persisted once the visitor has accepted it in
    // CookieConsentBanner. Declined or not-yet-answered still applies the
    // mode for this render/session, it just won't survive a reload.
    if (hasNonEssentialConsent()) writeCookie(MODE_COOKIE, next);
    document.documentElement.setAttribute("data-mode", next);
  };

  // If the visitor accepts cookies *after* already picking a mode this
  // session, persist whatever's currently applied right then — otherwise
  // their choice would silently not survive the reload they'd expect it
  // to. Only when it actually differs from the server-rendered default,
  // though — accepting the banner without ever touching ModeToggle
  // shouldn't itself write a cookie recording "the default," since that's
  // already what a visitor with no cookie at all sees anyway.
  useEffect(() => onConsentChange(() => {
    if (hasNonEssentialConsent() && mode !== defaultMode) writeCookie(MODE_COOKIE, mode);
  }), [mode, defaultMode]);

  useLayoutEffect(() => {
    const stored = readCookie(MODE_COOKIE);
    const resolved = isMode(stored) ? stored : defaultMode;

    // Intentional one-time hydration correction, not derived state render
    // could compute instead — the cookie isn't available during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(resolved);

    document.documentElement.setAttribute("data-mode", resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ModeContext.Provider
      value={{
        mode,
        setMode: applyMode,
        toggleMode: () => applyMode(mode === "dark" ? "light" : "dark"),
      }}
    >
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error("useMode must be used within a ModeProvider");
  return ctx;
}
