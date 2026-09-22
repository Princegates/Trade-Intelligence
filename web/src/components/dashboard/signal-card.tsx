import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { plainLanguageSummary } from "@/lib/plain-language";
import { isStale, type SignalView } from "@/lib/signals";

function verdictVariant(v: string) {
  if (v === "BUY") return "success" as const;
  if (v === "SELL") return "destructive" as const;
  return "secondary" as const;
}

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function Row({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-xs text-muted-foreground">
        {label} <span className="opacity-70">— {hint}</span>
      </span>
      <span className="font-mono text-sm tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/** A verdict alone is not actionable: "BUY" does not say where you were
 * wrong. Levels are sized from ATR, so they scale with how much this market
 * actually moves rather than an arbitrary percentage. */
function SignalLevels({
  levels,
  verdict,
}: {
  levels: NonNullable<SignalView["levels"]>;
  verdict: SignalView["verdict"];
}) {
  const directional = levels.entry !== null;

  return (
    <div className="mb-3 rounded-md border bg-muted/40 p-2.5">
      {directional ? (
        <>
          <Row label="Entry" value={money(levels.entry!)} hint="price when called" />
          <Row label="Stop" value={money(levels.stop!)} hint="exit; the call was wrong" />
          <Row label="Target" value={money(levels.target!)} hint="where to take profit" />
        </>
      ) : (
        <>
          <p className="mb-1 text-xs font-medium text-foreground">
            Hold between {money(levels.sellBelow!)} and {money(levels.buyAbove!)}
          </p>
          <Row label="Buy above" value={money(levels.buyAbove!)} hint="breaks upward" />
          <Row label="Sell below" value={money(levels.sellBelow!)} hint="breaks downward" />
        </>
      )}
      <p className="mt-2 border-t pt-1.5 text-[11px] leading-snug text-muted-foreground">
        {directional
          ? `Risking to ${money(levels.stop!)} to reach ${money(levels.target!)}. Levels are sized from recent volatility, not a forecast.`
          : "These are the prices that would change the call, not predictions that it will reach them."}
        {verdict !== "HOLD" && " Not advice — decide your own position size."}
      </p>
    </div>
  );
}

export function SignalCard({ signal }: { signal: SignalView }) {
  const stale = isStale(signal);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{signal.symbol}</CardTitle>
          <Badge variant="outline">{signal.timeframe}</Badge>
        </div>
        <CardDescription>
          ${signal.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} &middot;{" "}
          {new Date(signal.generatedAt).toLocaleString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* A stale card shows no direction at all. The verdict was sound when
            it was published, but a BUY or SELL read at a glance is acted on as
            current advice, and a warning label beside it does not undo that.
            The expired call stays available below as history. */}
        {stale ? (
          <div className="mb-3">
            <Badge variant="outline" className="border-destructive text-destructive">
              No current signal — feed has not updated
            </Badge>
            <p className="mt-3 text-sm text-foreground">
              The last call for this timeframe is too old to act on, so it is not shown. A new one
              appears once the feed updates.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant={verdictVariant(signal.verdict)}>{signal.verdict}</Badge>
              <span className="text-xs text-muted-foreground">
                score {signal.score > 0 ? `+${signal.score}` : signal.score}
              </span>
            </div>
            <p className="mb-3 text-sm text-foreground">{plainLanguageSummary(signal)}</p>
          </>
        )}

        {!stale && signal.levels && <SignalLevels levels={signal.levels} verdict={signal.verdict} />}

        {!stale && signal.patterns.length > 0 && (
          <p className="mb-3 text-xs text-muted-foreground">
            Candlestick evidence: <span className="text-foreground">{signal.patterns.join(", ")}</span>
          </p>
        )}

        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
            {stale ? "Show the expired call" : "Show the technical details"}
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {stale && (
              <li className="flex gap-2">
                <span className="select-none text-border">&bull;</span>
                <span>
                  Last published {signal.verdict} (score{" "}
                  {signal.score > 0 ? `+${signal.score}` : signal.score}) — expired, not current
                </span>
              </li>
            )}
            {signal.reasoning.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="select-none text-border">&bull;</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </details>

        <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
          {signal.confidence === null
            ? "Confidence not yet calibrated"
            : `Confidence ${(signal.confidence * 100).toFixed(0)}%`}
          {" · "}
          strategy {signal.strategyVersion}
        </p>
      </CardContent>
    </Card>
  );
}
