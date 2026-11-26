"use client";

import { useMemo } from "react";
import { formatUnits, type Address } from "viem";
import { useReadContract } from "wagmi";
import { PACK_DECIMALS } from "@/lib/tokens";

import { collectMarketAbi, collectMarketAddress, collectMarketLive, collectPacksAddress } from "@/lib/collect-packs";
import { useCollectCardsOf } from "@/lib/use-collect-market";
import { useNowSeconds } from "@/lib/use-now";

export type StockCardView = {
  id: bigint;
  ticker: string;
  /** Tokens inside (whole tokens); 0 while unfilled. */
  amount: number;
  rarity: number;
  tier: number;
  /** True: holds `amount` of its token. False: holds `usd` USDT until filled. */
  filled: boolean;
  /** Card value at opening, in dollars. */
  usd: number;
  /** In CollectStaking: earning, but can't be sold or redeemed until unstaked. */
  staked: boolean;
  since: number | null;
  /** Asking price while listed on CollectMarket, in `listCurrency`. */
  listPrice: number | null;
  listCurrency: "BNB" | "USDT" | null;
};

/**
 * A wallet's Grailio cards (the connected one unless `account` is given), with
 * any active listing of theirs on CollectMarket. Listings are non-custodial,
 * so a listed card is still in the wallet; this only marks it.
 */
export function useStockCards(account?: Address) {
  const { cards, ready, refetch: refetchCards } = useCollectCardsOf(account);
  const now = useNowSeconds();

  const { data: market, refetch: refetchMarket } = useReadContract({
    address: collectMarketAddress,
    abi: collectMarketAbi,
    functionName: "allListings",
    query: { enabled: collectMarketLive && cards.length > 0, refetchInterval: 15_000 },
  });

  const listed = useMemo(() => {
    const out = new Map<string, { price: number; currency: "BNB" | "USDT" }>();
    if (!market) return out;
    const [nfts, ids, sellers, prices, inAvax, expiresAts] = market;
    const owners = new Map(cards.map((c) => [String(c.id), true]));
    ids.forEach((id, i) => {
      if (nfts[i].toLowerCase() !== collectPacksAddress.toLowerCase() || !owners.has(String(id))) return;
      if (expiresAts[i] <= BigInt(now)) return;
      if (account && sellers[i].toLowerCase() !== account.toLowerCase()) return;
      out.set(String(id), { price: Number(formatUnits(prices[i], inAvax[i] ? 18 : PACK_DECIMALS)), currency: inAvax[i] ? "BNB" : "USDT" });
    });
    return out;
  }, [market, cards, now, account]);

  const views: StockCardView[] = cards.map((c) => {
    const listing = listed.get(String(c.id));
    return {
      id: c.id,
      ticker: c.ticker,
      amount: c.amount,
      rarity: c.rarity,
      tier: c.tier,
      filled: c.filled,
      usd: Number(formatUnits(c.usd, PACK_DECIMALS)),
      staked: c.staked ?? false,
      since: null,
      listPrice: listing?.price ?? null,
      listCurrency: listing?.currency ?? null,
    };
  });

  async function refetch() {
    refetchCards();
    await refetchMarket();
  }

  return { cards: views, refetch, ready };
}
