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
  // Lazy initializers read the same source as the inline script (theme-script.tsx)
  // so React's first render matches what's already in the DOM.
  const [theme, setThemeState] = useState<ThemeKey>(() => {
    const stored = readCookie(THEME_COOKIE);
    return isThemeKey(stored) ? stored : DEFAULT_THEME;
  });
  const [mode, setModeState] = useState<Mode>(() => {
    const stored = readCookie(MODE_COOKIE);
    return isMode(stored) ? stored : DEFAULT_MODE;
  });

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

  // React's Strict Mode remount in dev clears attributes the inline script
  // set (they aren't part of React's managed JSX). Re-apply here; no-op in
  // production and once hydrated in dev.
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.setAttribute("data-theme-ready", "true");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
