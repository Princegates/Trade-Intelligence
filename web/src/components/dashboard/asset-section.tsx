import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ConsensusTile } from "@/components/dashboard/consensus-tile";
import { SignalCard } from "@/components/dashboard/signal-card";
import { GudaSpecialSignalCard } from "@/components/dashboard/guda-special-signal-card";
import {
  backtestOdds,
  backtestOddsKey,
  liveStatKey,
  strongBacktest,
  type BacktestOddsSource,
  type LiveStat,
} from "@/lib/performance-view";
import { ASSET_NAMES, TIMEFRAME_SECONDS } from "@/lib/signals";
import { GUDA_SPECIAL_STRATEGY_VERSION } from "@/lib/guda-special-version";
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
 * `locked` still renders every card (a basic-view user sees there's a call
 * for each timeframe, not a gap) but blurs its content behind SignalCard's
 * own lock overlay — visible, not accessible, until full access.
 *
 * `gudaSpecialEnabled` is the admin on/off switch (web/src/lib/
 * guda-special-settings.ts), not a data-availability check — false means
 * the paired GudaSpecialSignalCard is never rendered at all, even as a
 * "no signal yet" placeholder, keeping the feature fully hidden until an
 * admin turns it on. When true, the card always appears next to the 15m
 * confluence card (paired per the "two cards shown together" decision),
 * showing "no signal yet" if `data.gudaSpecial` is null. */
export function AssetSection({
  data,
  bordered = true,
  detailed = true,
  locked = false,
  gudaSpecialEnabled = false,
  liveStats,
  oddsSources,
  showBacktestOdds = false,
}: {
  data: AssetPanelData;
  bordered?: boolean;
  detailed?: boolean;
  locked?: boolean;
  gudaSpecialEnabled?: boolean;
  /** Live records by liveStatKey(); undefined when the admin switch is off,
   * which leaves the line off every card. */
  liveStats?: Record<string, LiveStat>;
  /** Backtest figures by backtestOddsKey(), for the "Strong backtest"
   * badges and, when `showBacktestOdds` (the admin switch) is on, each
   * BUY/SELL card's backtest line. */
  oddsSources?: Record<string, BacktestOddsSource>;
  showBacktestOdds?: boolean;
}) {
  const { symbol, group, consensus, candlesByTimeframe, gudaSpecial } = data;
  const route = ASSET_ROUTES[symbol];

  // Longest timeframe first (1d, 4h, 1h, 15m, 5m) rather than whichever
  // order rows happened to come back in: the backtests found the engine's
  // edge on 4h and 1d for both markets, while 5m and 15m lost after costs,
  // so the calls worth the most attention lead. Reuses TIMEFRAME_SECONDS
  // rather than a second, separately-maintained order list; an
  // unrecognized timeframe sorts after every known one.
  const orderedGroup = [...group].sort(
    (a, b) => (TIMEFRAME_SECONDS[b.timeframe] ?? -Infinity) - (TIMEFRAME_SECONDS[a.timeframe] ?? -Infinity)
  );

  return (
    <section className={bordered ? "rounded-lg border p-4 sm:p-6" : undefined}>
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-semibold">{ASSET_NAMES[symbol] ?? symbol}</h3>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{symbol}</span>
        </div>
        {!detailed && route && (
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
          {orderedGroup.map((s) => {
            const backtest = oddsSources?.[backtestOddsKey(symbol, s.timeframe, s.strategyVersion)];
            return (
              <Fragment key={`${s.symbol}-${s.timeframe}`}>
                <SignalCard
                  signal={s}
                  locked={locked}
                  strong={strongBacktest(backtest)}
                  live={
                    liveStats && {
                      stat: liveStats[liveStatKey("confluence", symbol, s.timeframe, s.strategyVersion)] ?? null,
                    }
                  }
                  odds={showBacktestOdds && s.verdict !== "HOLD" ? backtestOdds(backtest) : null}
                />
                {gudaSpecialEnabled && s.timeframe === "15m" && (
                  <GudaSpecialSignalCard
                    signal={gudaSpecial}
                    locked={locked}
                    live={
                      liveStats && {
                        stat:
                          liveStats[liveStatKey("guda_special", symbol, "15m", GUDA_SPECIAL_STRATEGY_VERSION)] ?? null,
                      }
                    }
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </section>
  );
}
