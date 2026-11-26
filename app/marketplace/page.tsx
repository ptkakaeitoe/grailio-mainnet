import type { Metadata } from "next";
import { MarketplaceView } from "@/components/marketplace-view";
import { collectMarketLive } from "@/lib/collect-packs";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "Marketplace — grailio",
  description: "Buy and sell collectible cards on BNB Chain.",
};

export default function MarketplacePage() {
  return (
    <PageShell>
      {/* Demo market in demo mode; real listings once CollectMarket is deployed; "opening soon" before. */}
      <MarketplaceView live={collectMarketLive} mode="browse" />
    </PageShell>
  );
}
