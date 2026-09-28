import { History } from "lucide-react";
import { formatR, rTone, type BacktestOdds } from "@/lib/performance-view";

const EXPLAINER =
  "From replaying this same engine version over past candles and following every call to its stop or target, " +
  "after spread costs. R is the result as a multiple of the amount risked. " +
  "Past results don't guarantee future ones.";

/** How often this timeframe's calls reached their target in the backtest. */
export function BacktestOddsLine({ odds, timeframe }: { odds: BacktestOdds; timeframe: string }) {
  return (
    <p className="mt-3 flex gap-1.5 text-xs leading-snug text-muted-foreground" title={EXPLAINER}>
      <History className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        Backtest: {timeframe} calls reached their target{" "}
        <span className="font-medium text-foreground">{Math.round(odds.targetRate * 100)}%</span> of the time
        {odds.avgRNet !== null && (
          <>
            {" · "}
            <span className={`font-medium ${rTone(odds.avgRNet) || "text-foreground"}`}>{formatR(odds.avgRNet)} avg</span>
          </>
        )}
        {" · "}
        {odds.trades} trades
      </span>
    </p>
  );
}
