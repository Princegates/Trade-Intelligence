import "server-only";
import { buildConsensus, type Consensus } from "@/lib/consensus";
import { getCandlesByTimeframe, type Candle } from "@/lib/candles";
import type { SignalView } from "@/lib/signal-view";

export interface AssetPanelData {
  symbol: string;
  group: SignalView[];
  consensus: Consensus;
  candlesByTimeframe: Record<string, Candle[]>;
}

/** Everything one asset's section of the dashboard needs, built once so the
 * combined Overview page and each asset's own page (Bitcoin, Gold) render
 * from the same logic rather than two copies that can drift apart. */
export async function buildAssetPanel(symbol: string, signals: SignalView[]): Promise<AssetPanelData> {
  return {
    symbol,
    group: signals.filter((s) => s.symbol === symbol),
    consensus: buildConsensus(symbol, signals),
    candlesByTimeframe: await getCandlesByTimeframe(symbol),
  };
}
