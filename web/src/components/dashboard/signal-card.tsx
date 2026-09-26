import Link from "next/link";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { plainLanguageSummary } from "@/lib/plain-language";
import { AiTakeDialog } from "@/components/dashboard/ai-take-dialog";
import { isStale, type SignalView } from "@/lib/signals";

function verdictVariant(v: string) {
  if (v === "BUY") return "success" as const;
  if (v === "SELL") return "destructive" as const;
  return "secondary" as const;
}

/** Mirrors verdictVariant's color language: destructive already means
 * "something to be cautious about" (SELL), success already means the
 * favorable read (BUY) — REVERSAL and PULLBACK reuse those same signals
 * for a market-state label rather than a call. See
 * src/signals/entry_zone.py::market_phase() for what each phase means. */
function marketPhaseVariant(phase: string) {
  if (phase === "PULLBACK") return "success" as const;
  if (phase === "REVERSAL") return "destructive" as const;
  if (phase === "CONSOLIDATION") return "secondary" as const;
  if (phase === "BREAKOUT") return "outline" as const;
  return "warning" as const; // IMPULSE — a leg already underway, worth a second look before chasing.
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
  invalidationLevel,
  entryZone,
}: {
  levels: NonNullable<SignalView["levels"]>;
  verdict: SignalView["verdict"];
  invalidationLevel: SignalView["invalidationLevel"];
  entryZone: SignalView["entryZone"];
}) {
  // A partial set is not renderable, and a signal predating the levels
  // migration has none. Showing nothing beats showing "$undefined".
  const { entry, stop, target, buyAbove, sellBelow } = levels;
  const directional = entry != null && stop != null && target != null;
  const band = buyAbove != null && sellBelow != null;
  if (!directional && !band) return null;

  // The structural level itself is only worth a separate row when it
  // differs from the buffered stop — on an ATR-fallback call (no nearby
  // structure yet) invalidationLevel is null and this never renders.
  const showInvalidation = directional && invalidationLevel != null && invalidationLevel !== stop;

  return (
    <div className="mb-3 rounded-md border bg-muted/40 p-2.5">
      {directional ? (
        <>
          <Row label="Entry" value={money(entry)} hint="price when called" />
          <Row label="Stop" value={money(stop)} hint="exit; the call was wrong" />
          {showInvalidation && (
            <Row
              label="Invalidation"
              value={money(invalidationLevel!)}
              hint="structural level the stop buffers beyond"
            />
          )}
          <Row label="Target" value={money(target)} hint="where to take profit" />
        </>
      ) : (
        <>
          <p className="mb-1 text-xs font-medium text-foreground">
            Hold between {money(sellBelow!)} and {money(buyAbove!)}
          </p>
          <Row label="Buy above" value={money(buyAbove!)} hint="breaks upward" />
          <Row label="Sell below" value={money(sellBelow!)} hint="breaks downward" />
        </>
      )}
      {directional && entryZone && (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Preferred entry zone: {money(entryZone.low)}–{money(entryZone.high)}
        </p>
      )}
      <p className="mt-2 border-t pt-1.5 text-[11px] leading-snug text-muted-foreground">
        {directional
          ? `Risking to ${money(stop)} to reach ${money(target)}. Levels are sized from recent volatility, not a forecast.`
          : "These are the prices that would change the call, not predictions that it will reach them."}
        {verdict !== "HOLD" && " Not advice — decide your own position size."}
      </p>
    </div>
  );
}

/** `locked` keeps the card's existence and timeframe/price visible (so a
 * basic-view user can see there's a call for every timeframe, not just a
 * gap) while blurring the actual verdict/reasoning/levels underneath a
 * lock overlay — informed that it's there and how to unlock it, rather
 * than the detail simply not existing on the page. */
export function SignalCard({ signal, locked = false }: { signal: SignalView; locked?: boolean }) {
  const stale = isStale(signal);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{signal.symbol}</CardTitle>
          <div className="flex items-center gap-1.5">
            {!stale && signal.marketPhase && (
              <Badge variant={marketPhaseVariant(signal.marketPhase)}>{signal.marketPhase}</Badge>
            )}
            <Badge variant="outline">{signal.timeframe}</Badge>
          </div>
        </div>
        <CardDescription>
          ${signal.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} &middot;{" "}
          {new Date(signal.generatedAt).toLocaleString()}
        </CardDescription>
      </CardHeader>
      <CardContent className={locked ? "relative" : undefined}>
        <div className={locked ? "pointer-events-none select-none blur-sm" : undefined} aria-hidden={locked}>
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
              {signal.aiCommentary && (
                <AiTakeDialog commentary={signal.aiCommentary} symbol={signal.symbol} timeframe={signal.timeframe} />
              )}
            </>
          )}

          {!stale && signal.levels && (
            <SignalLevels
              levels={signal.levels}
              verdict={signal.verdict}
              invalidationLevel={signal.invalidationLevel}
              entryZone={signal.entryZone}
            />
          )}

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
              : `Confidence ${(signal.confidence * 100).toFixed(0)}% — confluence strength, not a win rate`}
            {" · "}
            strategy {signal.strategyVersion}
          </p>
        </div>

        {locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-b-xl bg-background/70 p-4 text-center backdrop-blur-[1px]">
            <Lock className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Full access required</p>
            <Link
              href="/dashboard/settings"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Redeem an access code
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
