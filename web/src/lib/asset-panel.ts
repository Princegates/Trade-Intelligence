import "server-only";
import { buildConsensus, type Consensus } from "@/lib/consensus";
import { getCandlesByTimeframe, type Candle } from "@/lib/candles";
import type { SignalView } from "@/lib/signal-view";
import type { GudaSpecialSignalView } from "@/lib/guda-special";

export interface AssetPanelData {
  symbol: string;
  group: SignalView[];
  consensus: Consensus;
  candlesByTimeframe: Record<string, Candle[]>;
  /** The latest resolved GUDA SPECIAL signal for this symbol, or null when
   * none has resolved yet (or the feature is disabled — callers pass []
   * in that case). Never fed into `consensus` above: a second strategy
   * isn't "another timeframe's opinion" (see buildConsensus()'s own
   * one-signal-per-timeframe weighting, which this would corrupt). */
  gudaSpecial: GudaSpecialSignalView | null;
}

/** Everything one asset's section of the dashboard needs, built once so the
 * combined Overview page and each asset's own page (Bitcoin, Gold) render
 * from the same logic rather than two copies that can drift apart. */
export async function buildAssetPanel(
  symbol: string,
  signals: SignalView[],
  gudaSpecialSignals: GudaSpecialSignalView[] = []
): Promise<AssetPanelData> {
  return {
    symbol,
    group: signals.filter((s) => s.symbol === symbol),
    consensus: buildConsensus(symbol, signals),
    candlesByTimeframe: await getCandlesByTimeframe(symbol),
    gudaSpecial: gudaSpecialSignals.find((s) => s.symbol === symbol) ?? null,
  };
}
