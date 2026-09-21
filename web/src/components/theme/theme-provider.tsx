"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_MODE,
  DEFAULT_THEME,
  MODE_COOKIE,
  THEME_COOKIE,
  isMode,
  isThemeKey,
  type Mode,
  type ThemeKey,
} from "@/lib/themes";

interface ThemeContextValue {
  theme: ThemeKey;
  mode: Mode;
  setTheme: (theme: ThemeKey) => void;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Always start from the same default the server rendered — the server
  // never sees the visitor's cookie, so reading it here on the client's
  // first render would make that render disagree with the server's and
  // crash hydration (this bit ThemePicker: its aria-pressed/checkmark read
  // this state directly). The real value is applied synchronously before
  // paint in the layout effect below instead, the same trick theme-script.tsx
  // uses for the data-theme/data-mode DOM attributes.
  const [theme, setThemeState] = useState<ThemeKey>(DEFAULT_THEME);
  const [mode, setModeState] = useState<Mode>(DEFAULT_MODE);

  const applyTheme = (next: ThemeKey) => {
    setThemeState(next);
    writeCookie(THEME_COOKIE, next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const applyMode = (next: Mode) => {
    setModeState(next);
    writeCookie(MODE_COOKIE, next);
    document.documentElement.setAttribute("data-mode", next);
  };

  // Runs after hydration but before the browser paints, so there's no
  // visible flash even though the first render above used the default.
  // Also re-applies the DOM attributes for React Strict Mode's dev-only
  // remount, which clears attributes the inline script set (they aren't
  // part of React's managed JSX). No-op in production once hydrated.
  useLayoutEffect(() => {
    const storedTheme = readCookie(THEME_COOKIE);
    const storedMode = readCookie(MODE_COOKIE);
    const resolvedTheme = isThemeKey(storedTheme) ? storedTheme : DEFAULT_THEME;
    const resolvedMode = isMode(storedMode) ? storedMode : DEFAULT_MODE;

    // Intentional: this is the one-time hydration correction described
    // above, not derived state that render could compute instead — the
    // cookie genuinely isn't available during SSR/the first client render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(resolvedTheme);
    setModeState(resolvedMode);

    document.documentElement.setAttribute("data-theme", resolvedTheme);
    document.documentElement.setAttribute("data-mode", resolvedMode);
    document.documentElement.setAttribute("data-theme-ready", "true");
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        mode,
        setTheme: applyTheme,
        setMode: applyMode,
        toggleMode: () => applyMode(mode === "dark" ? "light" : "dark"),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
