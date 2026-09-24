"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, LineChart, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  const { connected } = useSignalsRealtime();
  const inAdminArea = pathname.startsWith("/admin");
  const fullAccess = hasFullAccess(user);
  const remaining = daysRemaining(user);

  const SidebarContent = (
    <>
      <Link href="/" className="flex items-center gap-2 px-4 py-5 font-semibold">
        <LineChart className="size-5 text-primary" />
        <span>Trade Intelligence</span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">{SidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 flex w-64 flex-col bg-card">
            <button className="absolute right-3 top-4 p-1" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {SidebarContent}
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
                <Badge variant="warning" title="Ask your admin for an access code to unlock full trade history — see Settings">
                  Basic view
                </Badge>
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
    </div>
  );
}
