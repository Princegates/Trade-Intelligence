import Link from "next/link";
import { HistoryFilters } from "@/components/dashboard/history-filters";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getLatestSignals, getSignalHistory, symbolTimeframePairs } from "@/lib/signals";
import { plainLanguageSummary } from "@/lib/plain-language";
import { requireUser } from "@/lib/auth";
import { hasFullAccess } from "@/lib/access";

function verdictVariant(v: string) {
  if (v === "BUY") return "success" as const;
  if (v === "SELL") return "destructive" as const;
  return "secondary" as const;
}

export default async function HistoryPage({ searchParams }: PageProps<"/dashboard/history">) {
  const user = await requireUser();
  const fullAccess = hasFullAccess(user);

  const params = await searchParams;
  const { signals: latest } = await getLatestSignals();
  const pairs = symbolTimeframePairs(latest);

  const symbol = typeof params.symbol === "string" ? params.symbol : pairs[0]?.symbol ?? "BTCUSDT";
  const timeframe = typeof params.timeframe === "string" ? params.timeframe : pairs[0]?.timeframe ?? "1h";

  const history = await getSignalHistory(symbol, timeframe, fullAccess ? 25 : 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Signal history for the selected symbol and timeframe.</p>
        <HistoryFilters pairs={pairs} symbol={symbol} timeframe={timeframe} />
      </div>

      {!fullAccess && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              You&apos;re on the basic view — only the latest signal is shown. Ask your admin for an access code to
              unlock full history.
            </p>
            <Link href="/dashboard/settings" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Redeem a code
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No history yet for {symbol} / {timeframe}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>What it means</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(s.generatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={verdictVariant(s.verdict)}>{s.verdict}</Badge>
                    </TableCell>
                    <TableCell>{s.score > 0 ? `+${s.score}` : s.score}</TableCell>
                    <TableCell>${s.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm text-foreground">{plainLanguageSummary(s)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{s.reasoning.join("; ")}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
