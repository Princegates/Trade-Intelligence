"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function HistoryFilters({
  pairs,
  symbol,
  timeframe,
}: {
  pairs: { symbol: string; timeframe: string }[];
  symbol: string;
  timeframe: string;
}) {
  const router = useRouter();
  const current = `${symbol}:${timeframe}`;

  return (
    <Select
      value={current}
      onValueChange={(value) => {
        const [s, t] = value.split(":");
        router.push(`/dashboard/history?symbol=${s}&timeframe=${t}`);
      }}
    >
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Choose symbol & timeframe" />
      </SelectTrigger>
      <SelectContent>
        {pairs.map((p) => (
          <SelectItem key={`${p.symbol}:${p.timeframe}`} value={`${p.symbol}:${p.timeframe}`}>
            {p.symbol} &middot; {p.timeframe}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
