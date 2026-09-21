import { SignalCard } from "@/components/dashboard/signal-card";
import { getLatestSignals } from "@/lib/signals";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Badge } from "@/components/ui/badge";

export default async function DashboardOverviewPage() {
  const signals = await getLatestSignals();
  const bySymbol = new Map<string, typeof signals>();
  for (const s of signals) {
    bySymbol.set(s.symbol, [...(bySymbol.get(s.symbol) ?? []), s]);
  }

  return (
    <div className="space-y-8">
      {!isSupabaseConfigured() && (
        <Badge variant="outline" className="bg-muted">
          Demo mode — showing sample signals. Configure Supabase to see live data.
        </Badge>
      )}

      {[...bySymbol.entries()].map(([symbol, group]) => (
        <section key={symbol}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{symbol}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.map((s) => (
              <SignalCard key={`${s.symbol}-${s.timeframe}`} signal={s} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
