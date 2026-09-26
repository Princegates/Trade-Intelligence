import Link from "next/link";
import { AssetSection } from "@/components/dashboard/asset-section";
import { SuppressionList } from "@/components/dashboard/suppression-list";
import { buildAssetPanel } from "@/lib/asset-panel";
import { ASSET_NAMES, getLatestSignals, getRecentSuppressions, unresolvedSuppressions } from "@/lib/signals";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { hasFullAccess } from "@/lib/access";

/** One asset's own dashboard entry — the same section the Overview page
 * shows, on a page of its own, with feed health scoped to just this
 * instrument rather than both. Shared by /dashboard/bitcoin and
 * /dashboard/gold so the two never drift into two different layouts.
 *
 * The per-timeframe detail (reasoning, levels, patterns, AI take) is the
 * one thing this page has that the Overview doesn't — same "basic view"
 * gate as the History page, just gating detail instead of row count. */
export async function AssetPage({ symbol }: { symbol: string }) {
  const name = ASSET_NAMES[symbol] ?? symbol;

  const user = await requireUser();
  const fullAccess = hasFullAccess(user);

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

      {!fullAccess && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              You&apos;re on the basic view — only the consensus verdict is shown. Ask your admin for an access code
              to unlock full reasoning, levels, and patterns for every timeframe.
            </p>
            <Link
              href="/dashboard/settings"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Redeem a code
            </Link>
          </CardContent>
        </Card>
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
        <AssetSection data={data} bordered={false} detailed={fullAccess} showAllLink={false} />
      )}
    </div>
  );
}
