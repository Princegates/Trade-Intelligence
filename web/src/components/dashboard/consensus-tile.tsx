import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Consensus } from "@/lib/consensus";

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function verdictStyle(v: Consensus["verdict"]) {
  if (v === "BUY") return "text-emerald-600 dark:text-emerald-400";
  if (v === "SELL") return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function Level({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex-1 rounded-lg border bg-background p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-lg tabular-nums font-semibold ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

/** One answer across every timeframe, rather than five cards to reconcile.
 *
 * The levels are never averaged — they are taken whole from the heaviest
 * timeframe that agrees, and that timeframe is named, so the numbers always
 * describe one real setup. */
export function ConsensusTile({ consensus }: { consensus: Consensus }) {
  const { verdict, agreement, opinions, source, note, symbol } = consensus;
  const levels = source?.levels ?? null;
  const directional = verdict !== "HOLD" && levels?.entry != null && levels?.stop != null;

  return (
    <Card className="border-2">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {symbol} — all timeframes
          </p>
          <p className="text-xs text-muted-foreground">
            {Math.round(agreement * 100)}% of weighted timeframes agree
          </p>
        </div>

        <p className={`mt-1 text-4xl font-bold tracking-tight sm:text-5xl ${verdictStyle(verdict)}`}>{verdict}</p>
        <p className="mt-1 text-sm text-muted-foreground">{note}</p>

        {directional ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Level label="Entry" value={money(levels!.entry!)} />
            <Level label="Stop loss" value={money(levels!.stop!)} tone="text-red-600 dark:text-red-400" />
            {levels!.target != null && (
              <Level label="Target" value={money(levels!.target)} tone="text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
        ) : (
          levels?.buyAbove != null &&
          levels?.sellBelow != null && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Level label="Buy above" value={money(levels.buyAbove)} />
              <Level label="Sell below" value={money(levels.sellBelow)} />
            </div>
          )
        )}

        <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3">
          {opinions.map((o) => (
            <Badge
              key={o.timeframe}
              variant="outline"
              className={o.counted ? "" : "opacity-40 line-through"}
              title={o.counted ? `weight ${o.weight}` : "too old to count"}
            >
              {o.timeframe} {o.counted ? o.verdict : "stale"}
            </Badge>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Higher timeframes carry more weight — a daily candle reflects far more trading than a 5-minute one.
          Stale timeframes are struck through and do not vote.{" "}
          {directional
            ? "Levels come from the heaviest agreeing timeframe, not an average. Not advice — decide your own position size."
            : "No entry is shown because no direction has enough agreement behind it."}
        </p>
      </CardContent>
    </Card>
  );
}
