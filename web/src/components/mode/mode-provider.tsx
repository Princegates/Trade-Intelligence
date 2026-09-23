"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { MODE_COOKIE, isMode, type Mode } from "@/lib/themes";

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
    writeCookie(MODE_COOKIE, next);
    document.documentElement.setAttribute("data-mode", next);
  };

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
