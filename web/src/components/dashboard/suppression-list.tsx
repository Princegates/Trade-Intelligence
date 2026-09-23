import { Card, CardContent } from "@/components/ui/card";
import type { SuppressionView } from "@/lib/signals";

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

/** Why a signal is missing, one line per (symbol, timeframe) still
 * unresolved. `showSymbol` is off on a page already scoped to one
 * instrument (its own asset page), where repeating it on every line would
 * be noise rather than information. */
export function SuppressionList({
  suppressions,
  showSymbol = true,
}: {
  suppressions: SuppressionView[];
  showSymbol?: boolean;
}) {
  if (suppressions.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <h2 className="text-sm font-semibold">Feed health</h2>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {suppressions.map((s) => (
            <li key={`${s.symbol}-${s.timeframe}`}>
              <span className="font-medium text-foreground">
                {showSymbol ? `${s.symbol} / ${s.timeframe}` : s.timeframe}
              </span>{" "}
              — no signal because {SUPPRESSION_COPY[s.reason] ?? s.reason.toLowerCase()}
              {s.detail && !DETAIL_ADDS_NOTHING.has(s.reason) && <span className="text-xs"> ({s.detail})</span>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
