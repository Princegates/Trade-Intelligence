import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/admin/local-time";
import { getPerformance } from "@/lib/performance";
import { ASSET_NAMES } from "@/lib/signal-view";
import {
  SOURCE_LABELS,
  formatCostR,
  formatPct,
  formatR,
  formatRatio,
  groupOutcomes,
  latestBacktests,
  rTone,
} from "@/lib/performance-view";
import type { TradeSource } from "@/lib/supabase/types";

// Below this many closed trades a win rate or average swings too much from
// one trade to the next to mean much; flagged rather than hidden.
const SMALL_SAMPLE = 30;

function Setup({
  source,
  symbol,
  timeframe,
  version,
}: {
  source: TradeSource;
  symbol: string;
  timeframe: string;
  version?: string;
}) {
  return (
    <div className="whitespace-nowrap">
      <div className="font-medium">
        {ASSET_NAMES[symbol] ?? symbol} {timeframe}
      </div>
      <div className="text-xs text-muted-foreground">
        {SOURCE_LABELS[source]}
        {version && ` · ${version.replace(/^guda-special-/, "")}`}
      </div>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return (
    <div className="whitespace-nowrap">
      {n}
      {n > 0 && n < SMALL_SAMPLE && <div className="text-xs text-muted-foreground">small sample</div>}
    </div>
  );
}

const day = (iso: string) => iso.slice(0, 10);

export default async function AdminPerformancePage() {
  const { outcomes, backtests, unavailable } = await getPerformance();
  const groups = groupOutcomes(outcomes);
  const latest = latestBacktests(backtests);
  const calibrated = latest.filter((b) => b.calibration && b.calibration.length > 0);
  const recent = outcomes
    .filter((o) => o.status !== "OPEN" && o.exitTime)
    .sort((a, b) => (a.exitTime! < b.exitTime! ? 1 : -1))
    .slice(0, 20);
  const trackingSince = outcomes.reduce<string | null>(
    (oldest, o) => (oldest === null || o.signalTime < oldest ? o.signalTime : oldest),
    null
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Performance</CardTitle>
          <CardDescription>
            How each strategy&apos;s calls actually played out as trades, live and in backtests, measured the same
            way so the two can be compared.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-8 gap-y-1.5 text-sm text-muted-foreground sm:grid-cols-2">
            <li>Entry at the close of the candle that made the call.</li>
            <li>Every later candle checked by its high and low, so a wick through the stop counts.</li>
            <li>A candle touching both stop and target counts as the stop.</li>
            <li>Closed at market if neither is hit within 50 candles (96 for GUDA SPECIAL).</li>
            <li>
              Costs taken off every trade, sized for an Exness Standard account&apos;s spread with room for slippage:
              0.03% round trip for Bitcoin, 0.02% for gold.
            </li>
            <li>One position at a time per strategy, market and timeframe; calls made while one is open aren&apos;t counted.</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">R</span> is a multiple of the amount risked: +1R won as
            much as the stop would have lost, −1R is a full stop-out.
          </p>
        </CardContent>
      </Card>

      {unavailable && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Results couldn&apos;t be loaded. Check that migration 0028_trade_outcomes.sql has been run in Supabase.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live results</CardTitle>
          <CardDescription>
            {trackingSince ? (
              <>
                Every call tracked since <LocalTime iso={trackingSince} />, one row per engine version: an older
                version&apos;s trades were made by different rules (and before 3.4.0, priced at exchange fees
                rather than Exness spreads), so they don&apos;t count toward the current version&apos;s record.
              </>
            ) : (
              "Every new call is tracked from the moment it's made. Nothing recorded yet."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {groups.length === 0 ? (
            <p className="border-t border-border p-6 text-sm text-muted-foreground">No tracked trades yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setup</TableHead>
                  <TableHead>Closed</TableHead>
                  <TableHead>Open</TableHead>
                  <TableHead>Win rate</TableHead>
                  <TableHead>Avg after costs</TableHead>
                  <TableHead>Avg before costs</TableHead>
                  <TableHead>Cost per trade</TableHead>
                  <TableHead>Profit factor</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Max drawdown</TableHead>
                  <TableHead>Worst losing run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map(({ source, symbol, timeframe, strategyVersion, stats: s }) => (
                  <TableRow key={`${source}-${symbol}-${timeframe}-${strategyVersion}`}>
                    <TableCell>
                      <Setup source={source} symbol={symbol} timeframe={timeframe} version={strategyVersion} />
                    </TableCell>
                    <TableCell>
                      <Count n={s.trades} />
                    </TableCell>
                    <TableCell>{s.open}</TableCell>
                    <TableCell>{formatPct(s.winRate)}</TableCell>
                    <TableCell className={`font-medium ${rTone(s.avgRNet)}`}>{formatR(s.avgRNet)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatR(s.avgRGross)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatCostR(s.avgCostR)}</TableCell>
                    <TableCell>{formatRatio(s.profitFactor)}</TableCell>
                    <TableCell className={rTone(s.totalRNet)}>{formatR(s.trades ? s.totalRNet : null)}</TableCell>
                    <TableCell>{s.trades ? `${s.maxDrawdownR.toFixed(1)}R` : "—"}</TableCell>
                    <TableCell>{s.trades ? s.worstLosingStreak : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backtests</CardTitle>
          <CardDescription>
            The latest replay of each strategy over past candles, with the engine&apos;s live settings. Both markets
            rerun by themselves every Sunday; to run one sooner (after changing a setting, say), use GitHub: Actions →
            Backtest → Run workflow. Backtests can&apos;t see past economic news, so results around big releases are
            slightly optimistic.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {latest.length === 0 ? (
            <p className="border-t border-border p-6 text-sm text-muted-foreground">No backtests saved yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setup</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Trades</TableHead>
                  <TableHead>Win rate</TableHead>
                  <TableHead>Avg after costs</TableHead>
                  <TableHead>Avg before costs</TableHead>
                  <TableHead>Cost per trade</TableHead>
                  <TableHead>Profit factor</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Max drawdown</TableHead>
                  <TableHead>Run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latest.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Setup source={b.strategy} symbol={b.symbol} timeframe={b.timeframe} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {day(b.periodStart)} → {day(b.periodEnd)}
                    </TableCell>
                    <TableCell>
                      <Count n={b.trades} />
                    </TableCell>
                    <TableCell>{formatPct(b.winRate)}</TableCell>
                    <TableCell className={`font-medium ${rTone(b.avgRNet)}`}>{formatR(b.avgRNet)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatR(b.avgRGross)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatCostR(b.avgCostR)}</TableCell>
                    <TableCell>{formatRatio(b.profitFactor)}</TableCell>
                    <TableCell className={rTone(b.totalRNet)}>{formatR(b.trades ? b.totalRNet : null)}</TableCell>
                    <TableCell>{b.trades ? `${b.maxDrawdownR.toFixed(1)}R` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <LocalTime iso={b.createdAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {calibrated.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confidence score vs results</CardTitle>
            <CardDescription>
              The same backtests split by the confidence score each call carried. If the score meant something,
              higher bands would reach their target more often and average more R. In the Stage 3 backtests on
              Bitcoin, calls under 70 did somewhat worse, but above that higher bands did no better: 80+ trailed
              70–79 on 5m, 15m and 1h. That&apos;s why cards describe the score as confluence strength rather than
              odds. Bands under 30 trades are mostly luck.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setup</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Trades</TableHead>
                  <TableHead>Reached target</TableHead>
                  <TableHead>Win rate</TableHead>
                  <TableHead>Avg after costs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calibrated.flatMap((b) =>
                  b.calibration!.map((band, i) => (
                    <TableRow key={`${b.id}-${band.low}`}>
                      <TableCell>{i === 0 && <Setup source={b.strategy} symbol={b.symbol} timeframe={b.timeframe} />}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {band.low}–{band.high}
                      </TableCell>
                      <TableCell>
                        <Count n={band.trades} />
                      </TableCell>
                      <TableCell>{formatPct(band.targetRate)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatPct(band.winRate)}</TableCell>
                      <TableCell className={`font-medium ${rTone(band.avgRNet)}`}>{formatR(band.avgRNet)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recently closed trades</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <p className="border-t border-border p-6 text-sm text-muted-foreground">No trades have closed yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Closed</TableHead>
                  <TableHead>Setup</TableHead>
                  <TableHead>Call</TableHead>
                  <TableHead>Entry → exit</TableHead>
                  <TableHead>How it ended</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground">
                      <LocalTime iso={t.exitTime!} />
                    </TableCell>
                    <TableCell>
                      <Setup source={t.source} symbol={t.symbol} timeframe={t.timeframe} version={t.strategyVersion} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.direction === 1 ? "success" : "destructive"}>
                        {t.direction === 1 ? "BUY" : "SELL"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {t.entry.toLocaleString()} → {t.exitPrice?.toLocaleString() ?? "—"}
                    </TableCell>
                    <TableCell>
                      {t.status === "TARGET" ? "Hit target" : t.status === "STOP" ? "Stopped out" : "Timed out"}
                    </TableCell>
                    <TableCell className={`font-medium ${rTone(t.rNet)}`}>{formatR(t.rNet)}</TableCell>
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
