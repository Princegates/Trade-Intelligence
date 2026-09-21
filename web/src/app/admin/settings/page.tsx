import { Mail, MessageSquare, CreditCard, Bell, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderSettingsForm } from "@/components/admin/provider-settings-form";
import { Badge } from "@/components/ui/badge";
import { SETTINGS_PROVIDERS } from "@/lib/demo-data";
import { getAllProviderStates } from "@/lib/settings";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { SettingsCategory } from "@/lib/supabase/types";

const CATEGORIES: { key: SettingsCategory; label: string; icon: React.ReactNode }[] = [
  { key: "email", label: "Email", icon: <Mail className="size-4" /> },
  { key: "sms", label: "SMS", icon: <MessageSquare className="size-4" /> },
  { key: "payments", label: "Payments", icon: <CreditCard className="size-4" /> },
  { key: "push", label: "Push", icon: <Bell className="size-4" /> },
  { key: "ai", label: "AI / LLM", icon: <Sparkles className="size-4" /> },
];

export default async function AdminSettingsPage() {
  const providersByCategory = await Promise.all(CATEGORIES.map((c) => getAllProviderStates(c.key)));

  return (
    <div className="space-y-6">
      {!isSupabaseConfigured() && (
        <Badge variant="outline" className="bg-muted">
          Demo mode — changes here are not saved. Configure Supabase to persist settings.
        </Badge>
      )}

      <Tabs defaultValue="email">
        <TabsList>
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.key} value={c.key} className="gap-2">
              {c.icon}
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map((c, i) => (
          <TabsContent key={c.key} value={c.key}>
            <div className="grid gap-4 md:grid-cols-2">
              {providersByCategory[i].map(({ def, state }) => (
                <ProviderSettingsForm
                  key={def.provider}
                  category={c.key}
                  provider={def.provider}
                  label={def.label}
                  fields={def.fields}
                  state={state}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <p className="text-xs text-muted-foreground">
        {Object.values(SETTINGS_PROVIDERS).flat().length} providers configured across {CATEGORIES.length} categories.
        Secret fields are never redisplayed after saving — leave them blank to keep the saved value.
      </p>
    </div>
  );
}
