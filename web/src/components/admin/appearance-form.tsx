"use client";

import { useActionState, useState } from "react";
import { Check, Moon, Sun } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { THEMES, type Mode, type ThemeKey } from "@/lib/themes";
import { setSiteAppearance, type AppearanceFormState } from "@/lib/actions/appearance";

const initialState: AppearanceFormState = {};

/** A swatch preview: a small box carrying its own data-theme/data-mode so it
 * renders with that theme's real CSS variables, always in sync with themes.css. */
function Swatch({ themeKey, mode }: { themeKey: string; mode: Mode }) {
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

export function AppearanceForm({ current }: { current: { theme: ThemeKey; mode: Mode } }) {
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>(current.theme);
  const [selectedMode, setSelectedMode] = useState<Mode>(current.mode);
  const [state, formAction, pending] = useActionState(setSiteAppearance, initialState);

  const dirty = selectedTheme !== current.theme || selectedMode !== current.mode;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site appearance</CardTitle>
        <CardDescription>
          This applies to every visitor — the public site and every user&apos;s dashboard, approved or not.
          Nobody else can change it.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <input type="hidden" name="theme" value={selectedTheme} />
        <input type="hidden" name="mode" value={selectedMode} />

        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Day / night</p>
              <p className="text-xs text-muted-foreground">Currently live: {current.mode}</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={selectedMode === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedMode("light")}
              >
                <Sun className="size-4" /> Day
              </Button>
              <Button
                type="button"
                variant={selectedMode === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedMode("dark")}
              >
                <Moon className="size-4" /> Night
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              Theme <span className="font-normal text-muted-foreground">— currently live: {THEMES.find((t) => t.key === current.theme)?.label ?? current.theme}</span>
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {THEMES.map((t) => {
                const selected = t.key === selectedTheme;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSelectedTheme(t.key)}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                      selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/50"
                    )}
                  >
                    <Swatch themeKey={t.key} mode={selectedMode} />
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
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state.success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved — live for everyone now.</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "Saving..." : "Save and apply site-wide"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
