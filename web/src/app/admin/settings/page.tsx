import { Mail, MessageSquare, CreditCard, Bell, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProviderSettingsForm } from "@/components/admin/provider-settings-form";
import { PasswordForm } from "@/components/account/password-form";
import { TrialLengthForm } from "@/components/admin/trial-length-form";
import { Badge } from "@/components/ui/badge";
import { SETTINGS_PROVIDERS } from "@/lib/demo-data";
import { getAllProviderStates } from "@/lib/settings";
import { getAccessPolicy } from "@/lib/access-policy";
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
  const [providersByCategory, { trialDays }] = await Promise.all([
    Promise.all(CATEGORIES.map((c) => getAllProviderStates(c.key))),
    getAccessPolicy(),
  ]);

  return (
    <div className="space-y-6">
      {!isSupabaseConfigured() && (
        <Badge variant="outline" className="bg-muted">
          Demo mode — changes here are not saved. Configure Supabase to persist settings.
        </Badge>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Account security</CardTitle>
          <CardDescription>Change the password used to sign in to your own admin account.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Trial access</CardTitle>
          <CardDescription>
            New accounts get full access for a limited trial, then drop to a basic view (latest signal only) until
            you send them a code from Access Control.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrialLengthForm trialDays={trialDays} />
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-1 text-lg font-semibold">Platform integrations</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          API keys and configuration for the services the whole site runs on — not personal account settings.
        </p>
      </div>

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
