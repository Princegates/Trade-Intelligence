import { Mail, MessageSquare, CreditCard, Bell, Sparkles, Newspaper } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProviderSettingsForm } from "@/components/admin/provider-settings-form";
import { RefreshMarketNewsButton } from "@/components/admin/refresh-market-news-button";
import { PasswordForm } from "@/components/account/password-form";
import { AccessPolicyForm } from "@/components/admin/access-policy-form";
import { EngineSettingsForm } from "@/components/admin/engine-settings-form";
import { GudaSpecialToggle } from "@/components/admin/guda-special-toggle";
import { Badge } from "@/components/ui/badge";
import { SETTINGS_PROVIDERS } from "@/lib/demo-data";
import { getAllProviderStates } from "@/lib/settings";
import { getAccessPolicy } from "@/lib/access-policy";
import { getEngineSettings } from "@/lib/engine-settings";
import { getGudaSpecialSettings } from "@/lib/guda-special-settings";
import { getLiveResultsSettings } from "@/lib/live-results";
import { LiveResultsToggle } from "@/components/admin/live-results-toggle";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { SettingsCategory } from "@/lib/supabase/types";

const CATEGORIES: { key: SettingsCategory; label: string; icon: React.ReactNode }[] = [
  { key: "email", label: "Email", icon: <Mail className="size-4" /> },
  { key: "sms", label: "SMS", icon: <MessageSquare className="size-4" /> },
  { key: "payments", label: "Payments", icon: <CreditCard className="size-4" /> },
  { key: "push", label: "Push", icon: <Bell className="size-4" /> },
  { key: "ai", label: "AI / LLM", icon: <Sparkles className="size-4" /> },
  { key: "news", label: "News", icon: <Newspaper className="size-4" /> },
];

export default async function AdminSettingsPage() {
  const [providersByCategory, { trialDays, codeExpiryDays }, engineSettings, gudaSpecialSettings, liveResults] =
    await Promise.all([
      Promise.all(CATEGORIES.map((c) => getAllProviderStates(c.key))),
      getAccessPolicy(),
      getEngineSettings(),
      getGudaSpecialSettings(),
      getLiveResultsSettings(),
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
          <CardTitle>Trial & access codes</CardTitle>
          <CardDescription>
            New accounts get full access for a limited trial, then drop to a basic view (latest signal only) until
            you send them a code from Access Control. Codes themselves expire if not redeemed in time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccessPolicyForm trialDays={trialDays} codeExpiryDays={codeExpiryDays} />
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Entry-quality engine</CardTitle>
          <CardDescription>
            Thresholds the signal engine checks before publishing a BUY/SELL call. Confidence is a transparent read
            of how much of the engine&apos;s own evidence agrees with itself, not a calibrated win rate — see the
            reasoning behind any signal for the full breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EngineSettingsForm settings={engineSettings} />
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>GUDA SPECIAL visibility</CardTitle>
          <CardDescription>
            Turns the GUDA SPECIAL signal card on or off for every user. The strategy keeps running and publishing
            signals in the background either way — this only controls whether the dashboard shows them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GudaSpecialToggle enabled={gudaSpecialSettings.enabled} />
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Live results on the dashboard</CardTitle>
          <CardDescription>
            Shows each signal card its own timeframe&apos;s live record — for example &quot;Last 30 trades: 43% won ·
            +0.12R avg&quot; — from every call the current engine version has made, tracked as a real trade, after spread costs. Users see only these summary
            numbers. Full detail stays on the Performance page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LiveResultsToggle enabled={liveResults.enabled} />
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Backtest odds on signals</CardTitle>
          <CardDescription>
            Adds a line to each BUY/SELL call saying how often that timeframe&apos;s calls reached their target when
            the same engine version was replayed over past candles — for example &quot;Backtest: 1h calls reached
            their target 30% of the time · +0.04R avg · 387 trades&quot;. Uses the latest published backtest for that
            market and timeframe; nothing shows without one on the call&apos;s engine version or with fewer than 30
            trades. Needs migration 0030. Separately, and whether this is on or not, a timeframe whose backtest
            averaged +0.2R or more per trade gets a &quot;Strong backtest&quot; badge on its cards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LiveResultsToggle enabled={liveResults.showBacktestOdds} setting="odds" />
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
            {c.key === "news" && (
              <div className="mt-4">
                <RefreshMarketNewsButton />
              </div>
            )}
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
