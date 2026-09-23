// Keep this list's `key`s in sync with scripts/generate-themes.mjs (THEMES).
// It's a plain data file (not imported from the generator) because the
// generator script writes to disk as a side effect of being loaded.

export type ThemeKey =
  | "default"
  | "midnight"
  | "ocean"
  | "forest"
  | "sunset"
  | "royal"
  | "crimson"
  | "gold"
  | "cyberpunk"
  | "mono";

export type Mode = "light" | "dark";

export interface ThemeMeta {
  key: ThemeKey;
  label: string;
  description: string;
}

export const THEMES: ThemeMeta[] = [
  { key: "default", label: "Default", description: "Clean blue, balanced for everyday use" },
  { key: "midnight", label: "Midnight", description: "Deep indigo, calm and focused" },
  { key: "ocean", label: "Ocean", description: "Cyan/teal, soft rounded corners" },
  { key: "forest", label: "Forest", description: "Emerald green, grounded and natural" },
  { key: "sunset", label: "Sunset", description: "Warm orange, energetic" },
  { key: "royal", label: "Royal", description: "Rich purple, premium feel" },
  { key: "crimson", label: "Crimson", description: "Bold red, high contrast" },
  { key: "gold", label: "Gold Rush", description: "Amber gold — nods to the trading desk" },
  { key: "cyberpunk", label: "Cyberpunk", description: "Neon fuchsia, sharp angular corners" },
  { key: "mono", label: "Slate Mono", description: "Grayscale, minimal and distraction-free" },
];

export const DEFAULT_THEME: ThemeKey = "default";
export const DEFAULT_MODE: Mode = "light";

// Mode (day/night) is a per-visitor preference, unlike the color theme —
// see src/components/mode/. This is the cookie it's persisted in.
export const MODE_COOKIE = "ti-mode";

export function isThemeKey(value: string | undefined | null): value is ThemeKey {
  return !!value && THEMES.some((t) => t.key === value);
}

export function isMode(value: string | undefined | null): value is Mode {
  return value === "light" || value === "dark";
}
