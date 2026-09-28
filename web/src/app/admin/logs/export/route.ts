import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { actorOf, listActivity, logActivity } from "@/lib/activity-log";
import { activityToCsv, parseActivityFilters } from "@/lib/activity-log-view";

// Enough for a long look back without the response getting unwieldy; the
// filters on /admin/logs narrow it further.
const EXPORT_LIMIT = 10_000;

/** The system log as a CSV download, with the same filters as the page. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();

  const filters = { ...parseActivityFilters(Object.fromEntries(request.nextUrl.searchParams)), page: 1 };
  const { rows, unavailable } = await listActivity(filters, EXPORT_LIMIT);
  if (unavailable) return new Response("The system log couldn't be loaded.", { status: 503 });

  logActivity({
    action: "admin.log_exported",
    actor: actorOf(admin),
    details: { rows: rows.length, search: filters.q || null, type: filters.category || null, period: filters.since },
  });

  const date = new Date().toISOString().slice(0, 10);
  // The byte-order mark makes Excel read the file as UTF-8 (for "→" and "—").
  return new Response(`﻿${activityToCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="system-log-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
