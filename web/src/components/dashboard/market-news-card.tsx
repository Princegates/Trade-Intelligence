import { Newspaper } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime, type NewsItem } from "@/lib/news-view";

/** A trust signal ("this dashboard has current information"), not a feed
 * to act on — plain headlines linking out, no summarization or sentiment.
 * Renders nothing at all when there's nothing to show (no provider
 * configured yet, or the provider call failed) rather than an empty box,
 * which would undercut the very trust this card exists to build. */
export function MarketNewsCard({ items, now }: { items: NewsItem[]; now: number }) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="size-4" />
          Market News
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.url}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline"
              >
                {item.title}
              </a>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.source} · {formatRelativeTime(item.publishedAt, now)}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
