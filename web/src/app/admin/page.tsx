import { Users, ShieldCheck, Plug, LineChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listUsers } from "@/lib/users";
import { getLatestSignals } from "@/lib/signals";
import { DEMO_SETTINGS, SETTINGS_PROVIDERS } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

async function countActiveSettings() {
  if (!isSupabaseConfigured()) return DEMO_SETTINGS.filter((s) => s.isActive).length;
  const supabase = await createClient();
  if (!supabase) return 0;
  const { count } = await supabase.from("app_settings").select("*", { count: "exact", head: true }).eq("is_active", true);
  return count ?? 0;
}

export default async function AdminOverviewPage() {
  const [users, signals, activeSettings] = await Promise.all([listUsers(), getLatestSignals(), countActiveSettings()]);
  const admins = users.filter((u) => u.role === "admin").length;
  const totalProviders = Object.values(SETTINGS_PROVIDERS).flat().length;

  const stats = [
    { label: "Total users", value: users.length, icon: Users },
    { label: "Admins", value: admins, icon: ShieldCheck },
    { label: "Active integrations", value: `${activeSettings} / ${totalProviders}`, icon: Plug },
    { label: "Tracked signals", value: signals.length, icon: LineChart },
  ];

  return (
    <div className="space-y-8">
      {!isSupabaseConfigured() && (
        <Badge variant="outline" className="bg-muted">
          Demo mode — showing sample data. Configure Supabase to manage real users and settings.
        </Badge>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
