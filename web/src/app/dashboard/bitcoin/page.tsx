import { AssetPage } from "@/components/dashboard/asset-page";

// Market data must never be served from a build-time cache.
export const dynamic = "force-dynamic";

export default function BitcoinPage() {
  return <AssetPage symbol="BTCUSDT" />;
}
