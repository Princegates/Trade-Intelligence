import Link from "next/link";
import { Lock } from "lucide-react";
import { AdminWhatsAppLink } from "@/components/account/admin-whatsapp-link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignalLevels } from "@/components/dashboard/signal-card";
import type { GudaSpecialSignalView } from "@/lib/guda-special";
import { GUDA_SPECIAL_VERSION_LABEL } from "@/lib/guda-special-version";
import { LiveStatLine } from "@/components/dashboard/live-stat-line";
import type { LiveStat } from "@/lib/performance-view";

function verdictVariant(v: GudaSpecialSignalView["verdict"]) {
  if (v === "BUY") return "success" as const;
  if (v === "SELL") return "destructive" as const;
  return "secondary" as const; // NO_TRADE
}

function breakStrengthVariant(s: NonNullable<GudaSpecialSignalView["breakStrength"]>) {
  if (s === "STRONG") return "success" as const;
  if (s === "WEAK") return "warning" as const;
  return "outline" as const; // NORMAL
}

function retracementQualityVariant(q: NonNullable<GudaSpecialSignalView["retracementQuality"]>) {
  if (q === "VALID") return "success" as const;
  if (q === "FAILED") return "destructive" as const;
  return "warning" as const; // SHALLOW / DEEP
}

function htfFilterOutcomeVariant(o: NonNullable<GudaSpecialSignalView["htfFilterOutcome"]>) {
  if (o === "ALIGNED") return "success" as const;
  if (o === "REJECTED") return "destructive" as const;
  if (o === "DOWNGRADED") return "warning" as const;
  return "outline" as const; // NEUTRAL
}

/** Same convention as SignalCard's own volatilityRegimeVariant — only
 * HIGH/EXTREME ever reach the header badge. */
function volatilityRegimeVariant(regime: NonNullable<GudaSpecialSignalView["volatilityRegime"]>) {
  return regime === "EXTREME" ? ("destructive" as const) : ("warning" as const); // HIGH
}

function rangeZoneLabel(zone: NonNullable<GudaSpecialSignalView["priceRange"]>["zone"]) {
  return zone.replace("_", " ").toLowerCase();
}

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** GUDA SPECIAL's dashboard card — deliberately a separate component from
 * SignalCard, not a re-skin: the vocabulary (BOS, Fibonacci retracement,
 * break strength, HTF filter) doesn't overlap with the confluence engine's
 * (confidence, lifecycle, market phase). Paired next to the confluence
 * engine's own 15m card by asset-section.tsx per the "two cards shown
 * together" UI decision. `signal` is null when the current version hasn't
 * resolved a setup yet for this pair (older versions' signals are never
 * passed in — see guda-special-version.ts) — a setup can take up to
 * several hours to walk through BOS -> impulse -> retracement -> retest ->
 * confirmation on 15m candles, so a quiet card here is expected, not a bug. */
export function GudaSpecialSignalCard({
  signal,
  locked = false,
  live,
}: {
  signal: GudaSpecialSignalView | null;
  locked?: boolean;
  /** GUDA SPECIAL's own live record; absent when the admin switch is off. */
  live?: { stat: LiveStat | null };
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{signal ? signal.symbol : "GUDA SPECIAL"}</CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline">GUDA SPECIAL</Badge>
            <Badge variant="outline">15m</Badge>
          </div>
        </div>
        {/* Always shown, signal or not — this is a second, separate strategy
            from the confluence engine above it, so a first-time viewer needs
            to know what it's doing before the verdict/reasoning make sense. */}
        <CardDescription>
          A separate strategy: watches the 15-minute chart for a break in market structure, waits for price to
          pull back into a Fibonacci retracement zone, then confirms with a candlestick pattern before calling a
          trade.
        </CardDescription>
        {signal && (
          <p className="text-sm text-muted-foreground">
            {money(signal.price)} &middot; {new Date(signal.generatedAt).toLocaleString()}
          </p>
        )}
        {signal?.volatilityRegime && (signal.volatilityRegime === "HIGH" || signal.volatilityRegime === "EXTREME") && (
          <Badge
            variant={volatilityRegimeVariant(signal.volatilityRegime)}
            className="w-fit"
            title="Current ATR against this market's own longer-run average — a wider stop and more caution on entry timing, not a reason to skip the call on its own."
          >
            {signal.volatilityRegime === "EXTREME" ? "Extreme" : "High"} volatility
          </Badge>
        )}
        {live && <LiveStatLine stat={live.stat} />}
      </CardHeader>
      <CardContent className={locked ? "relative" : undefined}>
        <div className={locked ? "pointer-events-none select-none blur-sm" : undefined} aria-hidden={locked}>
          {!signal ? (
            <p className="text-sm text-foreground">
              Waiting for the first {GUDA_SPECIAL_VERSION_LABEL} signal — a setup can take up to several hours to
              resolve on the 15m timeframe.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant={verdictVariant(signal.verdict)}>{signal.verdict}</Badge>
                {signal.breakStrength && (
                  <Badge variant={breakStrengthVariant(signal.breakStrength)}>{signal.breakStrength} break</Badge>
                )}
              </div>
              <p className="mb-3 text-sm text-foreground">{signal.reasoning}</p>

              {signal.levels && (
                <SignalLevels
                  levels={{ entry: signal.levels.entry, stop: signal.levels.stop, target: signal.levels.target, buyAbove: null, sellBelow: null }}
                  verdict={signal.verdict === "BUY" ? "BUY" : "SELL"}
                  invalidationLevel={null}
                  entryZone={null}
                  symbol={signal.symbol}
                />
              )}

              <details className="group">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
                  Show the technical details
                </summary>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="select-none text-border">&bull;</span>
                    <span>
                      {signal.bosKind} {signal.bosDirection === 1 ? "up" : "down"} at {money(signal.bosPrice)}
                    </span>
                  </li>
                  {signal.impulse && (
                    <li className="flex gap-2">
                      <span className="select-none text-border">&bull;</span>
                      <span>Impulse {signal.impulse.atrMultiple.toFixed(2)}x ATR</span>
                    </li>
                  )}
                  {signal.fib && (
                    <li className="flex gap-2">
                      <span className="select-none text-border">&bull;</span>
                      <span>
                        Fibonacci zone: {money(signal.fib.f50)} (50%) – {money(signal.fib.f78_6)} (78.6%)
                      </span>
                    </li>
                  )}
                  {signal.priceRange && (
                    <li className="flex gap-2">
                      <span className="select-none text-border">&bull;</span>
                      <span>
                        Price position: {rangeZoneLabel(signal.priceRange.zone)} ({signal.priceRange.positionPct.toFixed(0)}%
                        of the impulse leg) — context, not a signal on its own
                      </span>
                    </li>
                  )}
                  {signal.volatilityRegime && (
                    <li className="flex gap-2">
                      <span className="select-none text-border">&bull;</span>
                      <span>Volatility: {signal.volatilityRegime.toLowerCase()}, vs. this market&apos;s own longer-run average</span>
                    </li>
                  )}
                  {signal.retracementQuality && (
                    <li className="flex items-center gap-2">
                      <span className="select-none text-border">&bull;</span>
                      <span>Retracement:</span>
                      <Badge variant={retracementQualityVariant(signal.retracementQuality)}>
                        {signal.retracementQuality}
                      </Badge>
                    </li>
                  )}
                  {signal.retestConfirmed !== null && (
                    <li className="flex gap-2">
                      <span className="select-none text-border">&bull;</span>
                      <span>Structure retest {signal.retestConfirmed ? "confirmed" : "not confirmed"}</span>
                    </li>
                  )}
                  {signal.confirmationPattern && (
                    <li className="flex gap-2">
                      <span className="select-none text-border">&bull;</span>
                      <span>
                        Confirmation: {signal.confirmationPattern}
                        {signal.candleQuality ? ` (${signal.candleQuality.toLowerCase()})` : ""}
                      </span>
                    </li>
                  )}
                  {signal.htfFilterOutcome && (
                    <li className="flex items-center gap-2">
                      <span className="select-none text-border">&bull;</span>
                      <span>1H bias {signal.htfBias ?? "unknown"}:</span>
                      <Badge variant={htfFilterOutcomeVariant(signal.htfFilterOutcome)}>
                        {signal.htfFilterOutcome}
                      </Badge>
                    </li>
                  )}
                  {signal.riskReward !== null && (
                    <li className="flex gap-2">
                      <span className="select-none text-border">&bull;</span>
                      <span>Risk:reward {signal.riskReward.toFixed(1)}</span>
                    </li>
                  )}
                  {signal.verdict === "NO_TRADE" && signal.noTradeReason && (
                    <li className="flex gap-2">
                      <span className="select-none text-border">&bull;</span>
                      <span>No trade: {signal.noTradeReason}</span>
                    </li>
                  )}
                </ul>
              </details>

              <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                Confidence scoring not yet available
                {" · "}
                strategy {signal.strategyVersion}
              </p>
            </>
          )}
        </div>

        {locked && signal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-b-xl bg-background/70 p-4 text-center backdrop-blur-[1px]">
            <Lock className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Full access required</p>
            <p className="text-xs text-muted-foreground">
              Contact admin on WhatsApp only: <AdminWhatsAppLink />
            </p>
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
