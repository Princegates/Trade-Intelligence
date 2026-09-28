import { LIVE_STAT_MIN_TRADES, formatR, rTone, type LiveStat } from "@/lib/performance-view";

const EXPLAINER =
  "Every call this engine version makes on this timeframe is followed as a real trade to its stop or target, " +
  "after spread costs; an update to the engine starts a fresh record. " +
  "R is the result as a multiple of the amount risked: +1R won as much as the stop would have lost. " +
  "Past results don't guarantee future ones.";

/** This timeframe's live record, one line. `stat` is null while no trade on
 * it has closed yet; the whole line is left out when the admin switch is
 * off (callers don't render it). */
export function LiveStatLine({ stat }: { stat: LiveStat | null }) {
  if (!stat || stat.trades === 0) {
    return (
      <p className="text-xs text-muted-foreground" title={EXPLAINER}>
        Live record: no trades closed yet
      </p>
    );
  }

  if (stat.trades < LIVE_STAT_MIN_TRADES) {
    return (
      <p className="text-xs text-muted-foreground" title={EXPLAINER}>
        Live record: {stat.trades} trade{stat.trades === 1 ? "" : "s"} closed so far, too few to judge yet
      </p>
    );
  }

  return (
    <p className="text-xs text-muted-foreground" title={EXPLAINER}>
      Last {stat.trades} trades: <span className="font-medium text-foreground">{Math.round((stat.winRate ?? 0) * 100)}% won</span>
      {" · "}
      <span className={`font-medium ${rTone(stat.avgRNet) || "text-foreground"}`}>{formatR(stat.avgRNet)} avg</span>
    </p>
  );
}
