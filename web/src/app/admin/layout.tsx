import { LayoutDashboard, Users, Settings, Palette } from "lucide-react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireAdmin } from "@/lib/auth";

const nav = [
  { href: "/admin", label: "Overview", icon: <LayoutDashboard className="size-4" /> },
  { href: "/admin/users", label: "Users", icon: <Users className="size-4" /> },
  { href: "/admin/appearance", label: "Appearance", icon: <Palette className="size-4" /> },
  { href: "/admin/settings", label: "Settings", icon: <Settings className="size-4" /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <DashboardShell title="Admin" nav={nav} user={user}>
      {children}
    </DashboardShell>
  );
}
