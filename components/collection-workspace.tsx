"use client";

import { ArrowUpRightIcon, GiftIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import { CollectionEditions } from "@/components/collection-editions";
import { CollectionPanel } from "@/components/collection-panel";
import { GiftClaimLink, GiftFromLink, SentGifts } from "@/components/gift-workspace";
import { marketGrid, marketMain, marketSide, sidePanel, stateAction } from "@/components/market-parts";
import { cn } from "@/components/clean-ui";

/**
 * Your collection: cards (stake, redeem, view) as the main column and your
 * unopened packs, ready to open, beside them. Pack reveals link here.
 */
export function CollectionWorkspace() {
  return (
    <div className="pt-6 pb-16 desk:pt-10">
      <GiftFromLink />
      <h1 className="sr-only">Collection</h1>

      {/* No title row: the columns start right under the nav, at the same height as /marketplace's Floor. */}
      <div className={cn(marketGrid, "mt-0 border-t-0 desk:mt-0")}>
        <section id="cards" className={cn(marketMain, "pt-0 desk:pt-0")} aria-labelledby="cards-title">
          <h2 id="cards-title" className="mb-6 text-[22px] leading-[1.3] font-normal tracking-tight">Cards</h2>
          <CollectionPanel />
        </section>

        <aside className={marketSide}>
          <section className={cn(sidePanel, "pt-0 max-desk:pt-8 desk:pt-0")} aria-labelledby="shelf-title">
            <CollectionEditions />
          </section>
          {/* Gifts you've bought, below the packs you own. */}
          <section className={cn(sidePanel, "border-t border-border")} aria-labelledby="gifts-title">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="gifts-title" className="text-[22px] leading-[1.3] font-normal tracking-tight">Gifts</h2>
            </div>
            <SentGifts
              empty={<GiftsEmpty title="No gifts yet." />}
              signedOut={<GiftsEmpty title="Connect to see your gifts." />}
              footer={<GiftClaimLink variant="button" className={cn(stateAction, "mt-4")}><GiftIcon aria-hidden="true" />Redeem a code</GiftClaimLink>}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

/** No gifts (or no wallet): one box that offers both ways in, redeem a code or send one. */
function GiftsEmpty({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-md border border-dashed border-border-strong px-4 py-8 text-center">
      <GiftIcon aria-hidden="true" className="size-6 text-muted" />
      <p className="text-base">{title}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <GiftClaimLink variant="button" className={stateAction}>Redeem a code</GiftClaimLink>
        <Link href="/packs#play" className={stateAction}>Send a gift<ArrowUpRightIcon weight="bold" /></Link>
      </div>
    </div>
  );
}
