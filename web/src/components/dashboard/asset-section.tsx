import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ConsensusTile } from "@/components/dashboard/consensus-tile";
import { SignalCard } from "@/components/dashboard/signal-card";
import { ASSET_NAMES } from "@/lib/signals";
import type { AssetPanelData } from "@/lib/asset-panel";

// Where each asset's own full-detail page lives — used only for the "see
// everything" link when this section is rendered as a summary.
const ASSET_ROUTES: Record<string, string> = {
  BTCUSDT: "/dashboard/bitcoin",
  XAUUSD: "/dashboard/gold",
};

/** One asset's consensus tile, and — unless `detailed` is off — its
 * per-timeframe signal cards underneath.
 *
 * The consensus tile is already the summary: one verdict, one set of
 * levels, the per-timeframe badges struck through where stale. The cards
 * below it are the detail — full reasoning, patterns, and levels for every
 * timeframe individually — which is the right amount of information on an
 * asset's own page, and too much to stack twice on the combined Overview.
 *
 * `bordered` draws its own box around the section — on, when several of
 * these sit stacked on one page (the Overview), off, when the asset already
 * has the whole page to itself (its own dashboard entry).
 *
 * `showAllLink` controls the "All N timeframes" link that appears whenever
 * `detailed` is off — the Overview needs it (that's how you get to the
 * detail), but the asset's own page (AssetPage) doesn't: when it renders
 * `detailed={false}` for a basic-view user, the link's target would be the
 * very page already on screen. */
export function AssetSection({
  data,
  bordered = true,
  detailed = true,
  showAllLink = true,
}: {
  data: AssetPanelData;
  bordered?: boolean;
  detailed?: boolean;
  showAllLink?: boolean;
}) {
  const { symbol, group, consensus, candlesByTimeframe } = data;
  const route = ASSET_ROUTES[symbol];

  return (
    <section className={bordered ? "rounded-lg border p-4 sm:p-6" : undefined}>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-semibold">{ASSET_NAMES[symbol] ?? symbol}</h3>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{symbol}</span>
        </div>
        {!detailed && showAllLink && route && (
          <Link
            href={route}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            All {group.length} timeframes <ArrowRight className="size-3" />
          </Link>
        )}
      </div>

      <div className={detailed ? "mb-4" : undefined}>
        <ConsensusTile consensus={consensus} candlesByTimeframe={candlesByTimeframe} />
      </div>

      {detailed && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {group.map((s) => (
            <SignalCard key={`${s.symbol}-${s.timeframe}`} signal={s} />
          ))}
        </div>
      )}
    </section>
  );
}
