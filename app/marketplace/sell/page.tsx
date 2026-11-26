import type { Metadata } from "next";
import { MarketplaceView } from "@/components/marketplace-view";
import { collectMarketLive } from "@/lib/collect-packs";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "Sell — grailio",
  description: "List a collectible card for sale on BNB Chain.",
};

export default function SellPage() {
  return (
    <PageShell>
      <MarketplaceView live={collectMarketLive} mode="sell" />
    </PageShell>
  );
}
