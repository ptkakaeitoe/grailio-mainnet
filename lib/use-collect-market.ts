"use client";

import { formatUnits, type Address } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { CARD_BY_TICKER } from "@/lib/cards";
import {
  tickerForAsset,
  collectCardsAbi,
  collectMarketAbi,
  collectMarketAddress,
  collectMarketLive,
  collectPacksAddress,
  collectPacksLive,
  collectStakingAbi,
  collectStakingAddress,
  collectStakingLive,
} from "@/lib/collect-packs";
import { TOKENS, PACK_DECIMALS } from "@/lib/tokens";

export type CardInfo = {
  id: bigint;
  ticker: string;
  tier: number;
  rarity: number;
  /** True: holds `amount` of the token. False: holds `usd` USDT until filled. */
  filled: boolean;
  /** Card value at opening, in USDT base units (PACK_DECIMALS, 18 on BNB Chain). */
  usd: bigint;
  /** Tokens inside, as a number in whole tokens. */
  amount: number;
  /** In CollectStaking (still yours, but can't be sold or redeemed until unstaked). */
  staked?: boolean;
};

export type CollectListing = CardInfo & {
  seller: Address;
  /** In the listing's currency: BNB wei (18 dec) or USDT (18 dec). */
  price: bigint;
  inAvax: boolean;
  expiresAt: number;
};

/** Price as a number in its own currency. */
export const priceAmount = (l: Pick<CollectListing, "price" | "inAvax">) => Number(formatUnits(l.price, l.inAvax ? 18 : PACK_DECIMALS));

type RawCard = readonly [number, number, number, boolean, bigint, bigint];

function toCard(id: bigint, raw: RawCard): CardInfo | null {
  const [asset, tier, rarity, filled, usd, amount] = raw;
  const ticker = tickerForAsset(asset);
  if (!ticker || !CARD_BY_TICKER[ticker]) return null;
  return { id, ticker, tier, rarity, filled, usd, amount: Number(formatUnits(amount, TOKENS[ticker].decimals)) };
}

/** Every buyable listing on CollectMarket, with what each card holds. */
export function useCollectListings() {
  const all = useReadContract({
    address: collectMarketAddress,
    abi: collectMarketAbi,
    functionName: "allListings",
    query: { enabled: collectMarketLive, refetchInterval: 15_000 },
  });
  const rows = all.data
    ? all.data[0].map((nft, i) => ({ nft, id: all.data[1][i], seller: all.data[2][i], price: all.data[3][i], inAvax: all.data[4][i], expiresAt: Number(all.data[5][i]) }))
        .filter((r) => r.nft.toLowerCase() === collectPacksAddress.toLowerCase())
    : [];

  const details = useReadContracts({
    allowFailure: true,
    contracts: rows.flatMap((r) => [
      { address: collectMarketAddress, abi: collectMarketAbi, functionName: "isValid" as const, args: [r.nft, r.id] as const },
      { address: collectPacksAddress, abi: collectCardsAbi, functionName: "cards" as const, args: [r.id] as const },
    ]),
    query: { enabled: rows.length > 0, refetchInterval: 15_000 },
  });

  const listings: CollectListing[] = [];
  rows.forEach((r, i) => {
    const valid = details.data?.[i * 2];
    const card = details.data?.[i * 2 + 1];
    if (valid?.status !== "success" || valid.result !== true || card?.status !== "success") return;
    const info = toCard(r.id, card.result as RawCard);
    if (info) listings.push({ ...info, seller: r.seller, price: r.price, inAvax: r.inAvax, expiresAt: r.expiresAt });
  });

  return {
    listings,
    loading: all.isLoading || (rows.length > 0 && details.isLoading),
    error: all.error ?? details.error,
    refetch: () => { void all.refetch(); void details.refetch(); },
  };
}

/**
 * A wallet's cards (CollectPacks is ERC-721 Enumerable): the connected one unless
 * `account` is given. Cards it has staked are included, marked `staked`.
 */
export function useCollectCardsOf(account?: Address) {
  const { address: connected } = useAccount();
  const address = account ?? connected;
  const enabled = collectPacksLive && Boolean(address);
  const balance = useReadContract({
    address: collectPacksAddress,
    abi: collectCardsAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled, refetchInterval: 15_000 },
  });
  const count = Math.min(Number(balance.data ?? 0n), 100);

  const ids = useReadContracts({
    allowFailure: true,
    contracts: Array.from({ length: count }, (_, i) => ({
      address: collectPacksAddress,
      abi: collectCardsAbi,
      functionName: "tokenOfOwnerByIndex" as const,
      args: [address!, BigInt(i)] as const,
    })),
    query: { enabled: enabled && count > 0 },
  });
  const staked = useReadContract({
    address: collectStakingAddress,
    abi: collectStakingAbi,
    functionName: "stakedBy",
    args: address ? [address] : undefined,
    query: { enabled: enabled && collectStakingLive, refetchInterval: 15_000 },
  });
  const stakedIds = new Set((staked.data ?? []).map(String));
  const cardIds = [...(ids.data ?? []).flatMap((r) => (r.status === "success" ? [r.result as bigint] : [])), ...(staked.data ?? [])];

  const cards = useReadContracts({
    allowFailure: true,
    contracts: cardIds.map((id) => ({ address: collectPacksAddress, abi: collectCardsAbi, functionName: "cards" as const, args: [id] as const })),
    query: { enabled: cardIds.length > 0 },
  });
  const mine = cardIds.flatMap((id, i) => {
    const row = cards.data?.[i];
    const info = row?.status === "success" ? toCard(id, row.result as RawCard) : null;
    return info ? [{ ...info, staked: stakedIds.has(String(id)) }] : [];
  });
  const stakedReady = !collectStakingLive || staked.data !== undefined;

  return {
    cards: mine,
    ready: !enabled || (balance.data !== undefined && stakedReady && (cardIds.length === 0 || cards.data !== undefined)),
    loading: balance.isLoading || ids.isLoading || cards.isLoading || staked.isLoading,
    refetch: () => { void balance.refetch(); void ids.refetch(); void cards.refetch(); void staked.refetch(); },
  };
}

/** Cards a wallet redeemed (burned): kept on-chain for its profile, no longer tradable. */
export function useRedeemedCards(account?: Address) {
  const enabled = collectPacksLive && Boolean(account);
  const ids = useReadContract({
    address: collectPacksAddress,
    abi: collectCardsAbi,
    functionName: "redeemedOf",
    args: account ? [account] : undefined,
    query: { enabled, refetchInterval: 30_000 },
  });
  const cardIds = [...(ids.data ?? [])].reverse(); // newest first
  const cards = useReadContracts({
    allowFailure: true,
    contracts: cardIds.map((id) => ({ address: collectPacksAddress, abi: collectCardsAbi, functionName: "cards" as const, args: [id] as const })),
    query: { enabled: cardIds.length > 0 },
  });
  const redeemed = cardIds.flatMap((id, i) => {
    const row = cards.data?.[i];
    const info = row?.status === "success" ? toCard(id, row.result as RawCard) : null;
    return info ? [info] : [];
  });
  return { cards: redeemed };
}

/** The connected wallet's cards. */
export const useMyCollectCards = () => useCollectCardsOf();
