"use client";

import { CollectMarketLive } from "@/components/collect-market-live";
import { DemoMarket } from "@/components/demo-market";
import { useDemo } from "@/components/demo-provider";
import type { MarketMode } from "@/components/market-parts";
import { MarketplaceWorkspace } from "@/components/marketplace-workspace";

/** Demo mode gets the simulated market; otherwise live listings once CollectMarket is deployed. */
export function MarketplaceView({ live, mode = "both" }: { live: boolean; mode?: MarketMode }) {
  const demo = useDemo();
  if (demo.active) return <DemoMarket mode={mode} />;
  return live ? <CollectMarketLive mode={mode} /> : <MarketplaceWorkspace mode={mode} />;
}
