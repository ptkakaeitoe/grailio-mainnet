import { notFound } from "next/navigation";
import { PackPanel } from "@/components/pack-panel";
import { SwapWorkspace } from "@/components/swap-workspace";
import { CollectionPanel } from "@/components/collection-panel";
import { collectMarketLive } from "@/lib/collect-packs";
import { MarketplaceView } from "@/components/marketplace-view";
import { CommunityView } from "@/components/community-view";
import { chatLive } from "@/lib/contracts";

const panels = {
  trade: SwapWorkspace,
  packs: PackPanel,
  collection: CollectionPanel,
  marketplace: () => <MarketplaceView live={collectMarketLive} />,
  community: () => <CommunityView live={chatLive} />,
};

export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section = [] } = await params;
  const key = section[0] ?? "trade";
  if (section.length > 1 || !Object.hasOwn(panels, key)) notFound();
  const Panel = panels[key as keyof typeof panels];
  return <section className={`v2-panel v2-panel--${key}`} aria-label={key}><Panel /></section>;
}
