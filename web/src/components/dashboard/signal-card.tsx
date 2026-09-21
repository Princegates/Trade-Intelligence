import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { plainLanguageSummary } from "@/lib/plain-language";
import { isStale, type SignalView } from "@/lib/signals";

function verdictVariant(v: string) {
  if (v === "BUY") return "success" as const;
  if (v === "SELL") return "destructive" as const;
  return "secondary" as const;
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={verdictVariant(signal.verdict)}>{signal.verdict}</Badge>
          <span className="text-xs text-muted-foreground">
            score {signal.score > 0 ? `+${signal.score}` : signal.score}
          </span>
          {stale && (
            <Badge variant="outline" className="border-destructive text-destructive">
              Stale — feed has not updated
            </Badge>
          )}
        </div>

        <p className="mb-3 text-sm text-foreground">{plainLanguageSummary(signal)}</p>

        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
            Show the technical details
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
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
