"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getConsent, setConsent, type ConsentChoice } from "@/lib/cookie-consent";

/** Shown once, to a visitor who hasn't answered yet (getConsent() === null)
 * — never shown again after a choice is recorded, even "Necessary only".
 * Site-wide (mounted in the root layout), since the gated cookie/storage
 * writes it governs (ModeProvider, DashboardShell, ChatWidget,
 * PositionSizeDialog, EventCalendar) aren't limited to the marketing
 * pages. */
export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(getConsent() === null);
  }, []);

  function choose(choice: ConsentChoice) {
    setConsent(choice);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card/95 px-4 py-4 shadow-lg backdrop-blur-xl sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use a strictly necessary cookie to keep you signed in. With your consent, we also set a small
          preference cookie and local storage for things like your theme choice — nothing is sold, shared, or used
          for advertising.{" "}
          <Link href="/cookie-policy" className="underline underline-offset-4 hover:text-foreground">
            Cookie Policy
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => choose("necessary")}>
            Necessary only
          </Button>
          <Button size="sm" onClick={() => choose("all")}>
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
