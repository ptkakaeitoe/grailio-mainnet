"use client";

import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import { cleanButton, cleanField, cn } from "@/components/clean-ui";
import {
  AssetFilter,
  MarketState,
  stateAction,
  MarketLayout,
  type MarketMode,
  SellButton,
  sectionLabel,
  sectionTitle,
  useAssetFilter,
} from "@/components/market-parts";
import { SellWorkspace } from "@/components/sell-workspace";
import { STOCK_CARDS } from "@/lib/cards";
import { isStock } from "@/lib/stock-assets";

/**
 * Shown until CollectMarket is deployed on mainnet (then CollectMarketLive takes
 * over). No sample listings: nothing here is for sale yet.
 */
export function MarketplaceWorkspace({ mode = "both" }: { mode?: MarketMode }) {
  const SellTitle = mode === "sell" ? "h1" : "h2";
  const assets = useAssetFilter({ cards: STOCK_CARDS, keep: (c) => isStock(c.ticker), listings: [] as never[], tickerOf: () => "", usdOf: () => null });
  return (
    <MarketLayout
      mode={mode}
      floor={
        <AssetFilter
          label="opening soon"
          filter={assets}
          action={mode === "browse" ? <SellButton /> : undefined}
        />
      }
      listings={<>
          <MarketState
            title="No listings yet."
            action={<>
              <Link href="/trade" className={stateAction}>Swap tokens<ArrowUpRightIcon weight="bold" /></Link>
              <Link href="/packs" className={stateAction}>Try packs<ArrowUpRightIcon weight="bold" /></Link>
            </>}
          />
      </>}
      sell={mode === "sell" ? (
        <SellWorkspace
          fee={0.01}
          cards={[]}
          empty={{ title: "Selling opens soon." }}
          selectedId={null}
          onSelect={() => {}}
          currency="USDC"
          onCurrency={() => {}}
          price=""
          onPrice={() => {}}
          avaxUsd={null}
          days={7}
          onDays={() => {}}
          submitLabel="Coming soon"
          submitDisabled
          onSubmit={() => {}}
          note="Selling opens when cards go live on BNB Chain."
        />
      ) : <>
            <div className="mb-6 flex items-baseline justify-between gap-3">
              <SellTitle className={sectionTitle}>Sell</SellTitle>
              <span className={sectionLabel}>[ fee 1% ]</span>
            </div>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm text-muted">
                <span>Card</span>
                <select className={cleanField} disabled>
                  <option>No cards yet</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-muted">
                <span>Price (USD)</span>
                <input className={cleanField} inputMode="decimal" placeholder="0.00" disabled />
              </label>
            </div>
            <button type="button" className={cn(cleanButton.solid, "mt-4 w-full justify-between")} disabled>
              Coming soon <ArrowUpRightIcon weight="bold" />
            </button>
      </>}
    />
  );
}
