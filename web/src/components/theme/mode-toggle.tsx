"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "@/lib/utils";

export function ModeToggle({ className }: { className?: string }) {
  const { mode, toggleMode } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={mode === "dark" ? "Switch to day mode" : "Switch to night mode"}
      title={mode === "dark" ? "Switch to day mode" : "Switch to night mode"}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
