import { LayoutDashboard, History, Settings } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUser } from "@/lib/auth";

const nav = [
  { href: "/dashboard", label: "Overview", icon: <LayoutDashboard className="size-4" /> },
  { href: "/dashboard/history", label: "History", icon: <History className="size-4" /> },
  { href: "/dashboard/settings", label: "Settings", icon: <Settings className="size-4" /> },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <DashboardShell title="Dashboard" nav={nav} user={user}>
      {children}
    </DashboardShell>
  );
}
