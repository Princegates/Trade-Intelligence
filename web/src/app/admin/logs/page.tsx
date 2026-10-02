import Link from "next/link";
import { Download } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/admin/local-time";
import { listActivity } from "@/lib/activity-log";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_PAGE_SIZE,
  SINCE_OPTIONS,
  actionLabel,
  describeUserAgent,
  filtersToQuery,
  formatDetails,
  parseActivityFilters,
} from "@/lib/activity-log-view";

// Native selects, styled like <Input>, so the filter form is a plain GET
// form that works without any client-side JavaScript.
const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default async function AdminLogsPage({ searchParams }: PageProps<"/admin/logs">) {
  const filters = parseActivityFilters(await searchParams);
  const { rows, total, unavailable } = await listActivity(filters);

  const firstShown = (filters.page - 1) * ACTIVITY_PAGE_SIZE + 1;
  const lastShown = firstShown + rows.length - 1;
  const hasPrevious = filters.page > 1;
  const hasNext = lastShown < total;
  const filtered = Boolean(filters.q || filters.category || filters.outcome || filters.since !== "7d");

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>System log</CardTitle>
          <CardDescription>
            Every action taken on the platform: sign-ups and sign-ins, account changes, Guda messages, lead forms,
            and every admin change. Entries can&apos;t be edited or deleted.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <a href={`/admin/logs/export${filtersToQuery({ ...filters, page: 1 })}`}>
            <Download /> Export CSV
          </a>
        </Button>
      </CardHeader>

      <CardContent className="space-y-4 p-0">
        <form method="get" className="flex flex-col gap-3 px-6 lg:flex-row lg:items-center">
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Search by email"
            aria-label="Search by email"
            className="lg:max-w-xs"
          />
          <select name="category" defaultValue={filters.category} aria-label="Type of action" className={selectClass}>
            <option value="">All actions</option>
            {ACTIVITY_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select name="outcome" defaultValue={filters.outcome} aria-label="Outcome" className={selectClass}>
            <option value="">Any outcome</option>
            <option value="success">Succeeded</option>
            <option value="failure">Failed</option>
          </select>
          <select name="since" defaultValue={filters.since} aria-label="Time period" className={selectClass}>
            {SINCE_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3">
            <Button type="submit">Apply</Button>
            {filtered && (
              <Link href="/admin/logs" className="text-sm text-muted-foreground hover:text-foreground">
                Clear
              </Link>
            )}
          </div>
        </form>

        {unavailable ? (
          <p className="border-t border-border p-6 text-sm text-muted-foreground">
            The system log couldn&apos;t be loaded. If it&apos;s new, check that migration 0027_activity_log.sql has
            been run in Supabase.
          </p>
        ) : rows.length === 0 ? (
          <p className="border-t border-border p-6 text-sm text-muted-foreground">
            {filtered ? "Nothing matches these filters." : "No activity recorded yet."}
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>From</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const details = formatDetails(row.details);
                    const target = row.targetLabel ?? row.targetId;
                    return (
                      <TableRow key={row.id} className="align-top">
                        <TableCell className="text-muted-foreground">
                          <LocalTime iso={row.createdAt} />
                        </TableCell>
                        <TableCell>
                          {row.actorEmail ? (
                            <Link
                              href={`/admin/logs${filtersToQuery(filters, { q: row.actorEmail, page: 1 })}`}
                              className="font-medium hover:underline"
                              title="Show only this person's activity"
                            >
                              {row.actorEmail}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Unknown</span>
                          )}
                          <div className="mt-1">
                            {row.actorRole === "admin" ? (
                              <Badge variant="outline">Admin</Badge>
                            ) : !row.actorId ? (
                              <span className="text-xs text-muted-foreground">Not signed in</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-48">
                          <div className="flex flex-wrap items-center gap-2">
                            <span>{actionLabel(row.action)}</span>
                            {row.outcome === "failure" && <Badge variant="destructive">Failed</Badge>}
                          </div>
                          {target && <div className="mt-1 text-xs text-muted-foreground">{target}</div>}
                        </TableCell>
                        <TableCell className="min-w-56 text-xs text-muted-foreground">
                          {details.length === 0 ? "—" : details.map((line) => <div key={line}>{line}</div>)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          <div>{row.ip ?? "—"}</div>
                          {row.userAgent && <div title={row.userAgent}>{describeUserAgent(row.userAgent)}</div>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y divide-border md:hidden">
              {rows.map((row) => {
                const details = formatDetails(row.details);
                const target = row.targetLabel ?? row.targetId;
                return (
                  <div key={row.id} className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        <LocalTime iso={row.createdAt} />
                      </span>
                      {row.outcome === "failure" && <Badge variant="destructive">Failed</Badge>}
                    </div>

                    <div>
                      <span className="font-medium">{actionLabel(row.action)}</span>
                      {target && <div className="text-xs text-muted-foreground">{target}</div>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {row.actorEmail ? (
                        <Link
                          href={`/admin/logs${filtersToQuery(filters, { q: row.actorEmail, page: 1 })}`}
                          className="font-medium hover:underline"
                        >
                          {row.actorEmail}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Unknown</span>
                      )}
                      {row.actorRole === "admin" ? (
                        <Badge variant="outline">Admin</Badge>
                      ) : !row.actorId ? (
                        <span className="text-xs text-muted-foreground">Not signed in</span>
                      ) : null}
                    </div>

                    {details.length > 0 && (
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        {details.map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      {row.ip ?? "—"}
                      {row.userAgent && ` · ${describeUserAgent(row.userAgent)}`}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-6 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing {firstShown}–{lastShown} of {total}
              </span>
              <div className="flex gap-2">
                {hasPrevious && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/logs${filtersToQuery(filters, { page: filters.page - 1 })}`}>Newer</Link>
                  </Button>
                )}
                {hasNext && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/logs${filtersToQuery(filters, { page: filters.page + 1 })}`}>Older</Link>
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        <p className="px-6 pb-6 text-xs text-muted-foreground">
          Never recorded: passwords, access codes, provider API keys, or the text of Guda messages.
        </p>
      </CardContent>
    </Card>
  );
}
