import { AssetSection } from "@/components/dashboard/asset-section";
import { SuppressionList } from "@/components/dashboard/suppression-list";
import { buildAssetPanel } from "@/lib/asset-panel";
import { ASSET_NAMES, getLatestSignals, getRecentSuppressions, unresolvedSuppressions } from "@/lib/signals";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/** One asset's own dashboard entry — the same section the Overview page
 * shows, on a page of its own, with feed health scoped to just this
 * instrument rather than both. Shared by /dashboard/bitcoin and
 * /dashboard/gold so the two never drift into two different layouts. */
export async function AssetPage({ symbol }: { symbol: string }) {
  const name = ASSET_NAMES[symbol] ?? symbol;

  const [{ source, signals }, allSuppressions] = await Promise.all([getLatestSignals(), getRecentSuppressions()]);

  const suppressions = unresolvedSuppressions(allSuppressions, signals).filter((s) => s.symbol === symbol);
  const data = await buildAssetPanel(symbol, signals);

  return (
    <div className="space-y-6">
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

      <SuppressionList suppressions={suppressions} showSymbol={false} />

      {source === "live" && data.group.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No {name} signals published yet. The scheduled job stores one per timeframe once it has enough closed
            candles to stand behind a call.
          </CardContent>
        </Card>
      ) : (
        <AssetSection data={data} bordered={false} />
      )}
    </div>
  );
}
