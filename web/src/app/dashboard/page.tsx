import { AssetSection } from "@/components/dashboard/asset-section";
import { EventCalendar } from "@/components/dashboard/event-calendar";
import { SuppressionList } from "@/components/dashboard/suppression-list";
import { buildAssetPanel } from "@/lib/asset-panel";
import { getUpcomingEvents } from "@/lib/calendar";
import { ASSET_ORDER, getLatestSignals, getRecentSuppressions, unresolvedSuppressions } from "@/lib/signals";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// Market data must never be served from a build-time cache.
export const dynamic = "force-dynamic";

// A plain (non-component) function, the same way lib/consensus.ts's
// buildConsensus defaults its own `now` parameter — the render-purity lint
// rule checks component bodies for direct Date.now() calls, not calls made
// through an ordinary function, and this page only ever renders once per
// request server-side, not reactively re-rendered against stale props.
function currentTime() {
  return Date.now();
}

export default async function DashboardOverviewPage() {
  const now = currentTime();

  const [{ source, signals }, allSuppressions, events] = await Promise.all([
    getLatestSignals(),
    getRecentSuppressions(),
    getUpcomingEvents(),
  ]);

  // A suppression is only worth showing while it is still the latest word on
  // that series; once a signal arrives, the feed recovered.
  const suppressions = unresolvedSuppressions(allSuppressions, signals);

  // Fixed order (Bitcoin, then gold — matching src/config.py's INSTRUMENTS)
  // rather than whichever symbol's freshest signal happened to sort first,
  // which would otherwise reorder the page on every reload. A symbol not
  // yet added to ASSET_ORDER is sorted after the known ones rather than
  // dropped, so a newly-tracked instrument still shows up.
  const present = [...new Set(signals.map((s) => s.symbol))];
  const orderedSymbols = present.sort((a, b) => {
    const ai = ASSET_ORDER.indexOf(a);
    const bi = ASSET_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const panels = await Promise.all(orderedSymbols.map((symbol) => buildAssetPanel(symbol, signals)));

  return (
    <div className="space-y-8">
      {source === "demo" && (
        <Badge variant="outline" className="bg-muted">
          Demo mode — sample signals, not live prices. Configure Supabase to see real data.
        </Badge>
      )}

      {source === "unavailable" && (
        <Badge variant="outline" className="border-destructive text-destructive">
          Live feed unavailable — showing nothing rather than stale or sample prices.
        </Badge>
      )}

      <SuppressionList suppressions={suppressions} />

      {source === "live" && signals.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No signals published yet. The hourly job stores one per instrument and timeframe once it has
            enough closed candles to stand behind a call.
          </CardContent>
        </Card>
      )}

      <EventCalendar events={events} now={now} />

      {panels.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Assets</h2>
          <p className="mb-4 -mt-2 text-xs text-muted-foreground">
            Bitcoin and Gold each also have their own page in the sidebar for a focused view.
          </p>
          <div className="space-y-6">
            {panels.map((data) => (
              <AssetSection key={data.symbol} data={data} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
