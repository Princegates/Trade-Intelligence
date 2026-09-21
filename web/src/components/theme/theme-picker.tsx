"use client";

import { Check } from "lucide-react";
import { THEMES } from "@/lib/themes";
import { useTheme } from "./theme-provider";
import { cn } from "@/lib/utils";

/** A swatch preview: a small box carrying its own data-theme/data-mode so it
 * renders with that theme's real CSS variables, always in sync with themes.css. */
function Swatch({ themeKey, mode }: { themeKey: string; mode: string }) {
  return (
    <div
      data-theme={themeKey}
      data-mode={mode}
      className="flex h-10 w-full overflow-hidden rounded-md border border-border"
    >
      <div className="flex-1 bg-background" />
      <div className="flex-1 bg-primary" />
      <div className="flex-1 bg-accent" />
    </div>
  );
}

export function ThemePicker() {
  const { theme, mode, setTheme } = useTheme();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {THEMES.map((t) => {
        const selected = t.key === theme;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setTheme(t.key)}
            aria-pressed={selected}
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
              selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50"
            )}
          >
            <Swatch themeKey={t.key} mode={mode} />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
              {selected && <Check className="size-4 shrink-0 text-primary" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
