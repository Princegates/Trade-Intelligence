import { ConsensusTile } from "@/components/dashboard/consensus-tile";
import { SignalCard } from "@/components/dashboard/signal-card";
import { ASSET_NAMES } from "@/lib/signals";
import type { AssetPanelData } from "@/lib/asset-panel";

/** One asset's consensus tile plus its per-timeframe signal cards.
 *
 * `bordered` draws its own box around the section — on, when several of
 * these sit stacked on one page (the Overview), off, when the asset already
 * has the whole page to itself (its own dashboard entry). */
export function AssetSection({ data, bordered = true }: { data: AssetPanelData; bordered?: boolean }) {
  const { symbol, group, consensus, candlesByTimeframe } = data;

  return (
    <section className={bordered ? "rounded-lg border p-4 sm:p-6" : undefined}>
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
  );
}
