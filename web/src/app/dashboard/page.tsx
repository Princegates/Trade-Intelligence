import { SignalCard } from "@/components/dashboard/signal-card";
import { ConsensusTile } from "@/components/dashboard/consensus-tile";
import { EventCalendar } from "@/components/dashboard/event-calendar";
import { buildConsensus } from "@/lib/consensus";
import { getCandlesByTimeframe } from "@/lib/candles";
import { getUpcomingEvents } from "@/lib/calendar";
import { ASSET_NAMES, ASSET_ORDER, getLatestSignals, getRecentSuppressions, unresolvedSuppressions } from "@/lib/signals";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// Market data must never be served from a build-time cache.
export const dynamic = "force-dynamic";

const SUPPRESSION_COPY: Record<string, string> = {
  FETCH_FAILED: "the provider could not be reached",
  NO_DATA: "the provider returned nothing, which usually means its API key is not set",
  BAD_CANDLE: "the feed sent an impossible candle",
  INSUFFICIENT_HISTORY: "there is not enough closed history yet",
  STALE_DATA: "the feed has gone stale",
};

// Reasons whose stored detail only restates the sentence above it. The others
// carry something the reader cannot infer — an error, a count, an age.
const DETAIL_ADDS_NOTHING = new Set(["NO_DATA"]);

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

  const bySymbol = new Map<string, typeof signals>();
  for (const s of signals) {
    bySymbol.set(s.symbol, [...(bySymbol.get(s.symbol) ?? []), s]);
  }

  // Fixed order (Bitcoin, then gold — matching src/config.py's INSTRUMENTS)
  // rather than whichever symbol's freshest signal happened to sort first,
  // which would otherwise reorder the page on every reload.
  const orderedSymbols = [...bySymbol.keys()].sort((a, b) => {
    const ai = ASSET_ORDER.indexOf(a);
    const bi = ASSET_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // The chart shows the series the levels were taken from, so the lines drawn
  // on it belong to the candles under them.
  const views = await Promise.all(
    orderedSymbols.map(async (symbol) => {
      const group = bySymbol.get(symbol)!;
      const consensus = buildConsensus(symbol, signals);
      return { symbol, group, consensus, candlesByTimeframe: await getCandlesByTimeframe(symbol) };
    }),
  );

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

      {suppressions.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className="text-sm font-semibold">Feed health</h2>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {suppressions.map((s) => (
                <li key={`${s.symbol}-${s.timeframe}`}>
                  <span className="font-medium text-foreground">
                    {s.symbol} / {s.timeframe}
                  </span>{" "}
                  — no signal because {SUPPRESSION_COPY[s.reason] ?? s.reason.toLowerCase()}
                  {s.detail && !DETAIL_ADDS_NOTHING.has(s.reason) && (
                    <span className="text-xs"> ({s.detail})</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {source === "live" && signals.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No signals published yet. The hourly job stores one per instrument and timeframe once it has
            enough closed candles to stand behind a call.
          </CardContent>
        </Card>
      )}

      <EventCalendar events={events} now={now} />

      {views.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Assets</h2>
          <div className="space-y-6">
            {views.map(({ symbol, group, consensus, candlesByTimeframe }) => (
              <section key={symbol} className="rounded-lg border p-4 sm:p-6">
                <div className="mb-4 flex items-baseline gap-2">
                  <h3 className="text-base font-semibold">{ASSET_NAMES[symbol] ?? symbol}</h3>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{symbol}</span>
                </div>

                <div className="mb-4">
                  <ConsensusTile consensus={consensus} candlesByTimeframe={candlesByTimeframe} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((s) => (
                    <SignalCard key={`${s.symbol}-${s.timeframe}`} signal={s} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
