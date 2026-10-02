"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, LogOut, Menu, Pin, PinOff, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/layout/brand-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/actions/auth";
import { useSignalsRealtime } from "@/lib/use-signals-realtime";
import { ModeToggle } from "@/components/mode/mode-toggle";
import { hasFullAccess, daysRemaining } from "@/lib/access";
import { ChatWidget } from "@/components/chat/chat-widget";
import type { Role } from "@/lib/supabase/types";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

interface DashboardShellProps {
  title: string;
  nav: NavItem[];
  user: { email: string; fullName: string | null; role: Role; fullAccessUntil: string | null };
  children: ReactNode;
}

const SIDEBAR_PINNED_KEY = "sidebar-pinned";

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function DashboardShell({ title, nav, user, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Starts pinned (expanded), matching what the server renders — the
  // stored preference isn't available during SSR, so it's applied as a
  // one-time hydration correction below, same trick ModeProvider uses for
  // the signed-in theme/mode choice.
  const [pinned, setPinned] = useState(true);
  // Purely transient (never persisted) — true while the pointer is over an
  // unpinned sidebar, which is what actually drives the hover-to-expand
  // rail. Has no effect while pinned.
  const [hovering, setHovering] = useState(false);
  const expanded = pinned || hovering;
  const { connected } = useSignalsRealtime();
  const inAdminArea = pathname.startsWith("/admin");
  const fullAccess = hasFullAccess(user);
  const remaining = daysRemaining(user);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinned(window.localStorage.getItem(SIDEBAR_PINNED_KEY) !== "false");
  }, []);

  function togglePinned() {
    const next = !pinned;
    setPinned(next);
    window.localStorage.setItem(SIDEBAR_PINNED_KEY, String(next));
  }

  function renderSidebarContent(rail: boolean, showPinToggle: boolean) {
    return (
      <>
        {/* Pin toggle sits right next to the logo, not at the bottom of the
            nav list — a flex-1 nav column leaves a lot of empty space above
            a bottom-anchored button on pages with few nav items, which made
            it easy to miss entirely. Keeping it in the header means it's
            always the first thing visible, in both rail and expanded
            widths. */}
        <div className={cn("flex items-center gap-1 px-4 py-5", rail && "flex-col gap-2 px-2")}>
          <Link href="/" className="flex min-w-0 flex-1 items-center">
            <BrandMark compact={rail} />
          </Link>
          {showPinToggle && (
            <button
              type="button"
              onClick={togglePinned}
              title={pinned ? "Unpin sidebar (collapses to icons, expands on hover)" : "Pin sidebar open"}
              aria-label={pinned ? "Unpin sidebar" : "Pin sidebar"}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            </button>
          )}
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={rail ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  rail && "justify-center px-2",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {item.icon}
                {!rail && item.label}
              </Link>
            );
          })}
        </nav>
      </>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Ambient glow behind the sidebar — without it, the sidebar's blur
          has nothing but flat page background to blur (bg-card and
          bg-background sit only ~2 percentage points apart in lightness in
          every theme), so the "glass" panel reads as solid even though the
          opacity/blur are genuinely applied. This gives it something real
          to show through at all times, not just while hover-expanded or on
          the mobile drawer (where it already overlaps visible content).
          Negative z-index: paints above the page's own flat background,
          below every normal-flow and positioned element. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 left-0 -z-10 w-96 bg-gradient-to-b from-primary/60 via-primary/25 to-transparent blur-2xl"
      />

      {/* This wrapper reserves the sidebar's docked width in the flex layout
          (16rem pinned, 4rem as a rail) — the aside itself is absolutely
          positioned inside it so hovering an unpinned rail can grow it over
          the main content instead of pushing/reflowing everything else on
          every mouse-in/out. */}
      <div className={cn("relative hidden shrink-0 transition-[width] duration-200 ease-in-out md:block", pinned ? "w-64" : "w-16")}>
        {/* bg-card and bg-background sit only ~2 percentage points apart in
            lightness in every theme (see themes.css), so when this panel is
            docked next to plain page background — nothing patterned or
            colored behind it to actually blur — opacity alone reads as
            solid. The shadow (always on, not just while hover-expanded)
            and border are what read as "a distinct floating layer" there;
            the blur/opacity genuinely shows once something IS behind it
            (hover-expanded over page content, or the mobile drawer over
            the dimmed backdrop). */}
        <aside
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          className={cn(
            "absolute inset-y-0 left-0 z-20 flex flex-col border-r border-border bg-card/60 shadow-lg backdrop-blur-xl backdrop-saturate-150 transition-[width] duration-150 ease-in-out",
            expanded ? "w-64" : "w-16",
            !pinned && hovering && "shadow-2xl"
          )}
        >
          {renderSidebarContent(!expanded, true)}
        </aside>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 flex w-64 flex-col bg-card/80 backdrop-blur-xl">
            <button className="absolute right-3 top-4 p-1" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {renderSidebarContent(false, false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button className="p-1 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <h1 className="text-lg font-semibold">{title}</h1>
            {connected && (
              <span
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground"
                title="Updates automatically as new signals are published"
              >
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Live
              </span>
            )}
            {user.role !== "admin" &&
              (fullAccess ? (
                remaining !== null && (
                  <Badge variant="outline" title="Full access — every timeframe's full history">
                    {remaining === 0 ? "Trial ends today" : `Trial: ${remaining}d left`}
                  </Badge>
                )
              ) : (
                // Links to Settings, where the WhatsApp contact and code box are —
                // a tooltip alone does nothing on a phone.
                <Link href="/dashboard/settings">
                  <Badge
                    variant="warning"
                    title="Contact admin on WhatsApp only for a code to unlock premium"
                  >
                    Basic view
                  </Badge>
                </Link>
              ))}
          </div>

          <div className="flex items-center gap-2">
            <ModeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 rounded-full">
                  <Avatar>
                    <AvatarFallback>{initials(user.fullName, user.email)}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.fullName || user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {inAdminArea && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard">
                        <LayoutDashboard />
                        View dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {!inAdminArea && user.role === "admin" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/admin">
                        <ShieldCheck />
                        Admin panel
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {/* A <form action={signOut}> submit button here doesn't reliably fire:
                    Radix closes/unmounts the menu on selection, which can interrupt the
                    browser's default form submission before it completes. Calling the
                    Server Action directly from onSelect avoids that. */}
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>

      <ChatWidget fullAccess={fullAccess} />
    </div>
  );
}
