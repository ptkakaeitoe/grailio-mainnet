import { useQueries } from "@tanstack/react-query";
import { useReadContracts } from "wagmi";

import { ASSET_TICKERS, collectCardsAbi, collectPacksAddress } from "@/lib/collect-packs";
import { avatarsAbi, avatarsAddress, avatarsLive } from "@/lib/contracts";

/**
 * A profile picture and its crop (focus in basis points, zoom in %). Card
 * avatars set `ticker` (the card's art); NFT avatars set `nft` and `image`.
 */
export type CardAvatarCrop = { tokenId: bigint; ticker: string; rarity?: number; tier?: number; nft?: string; image?: string | null; label?: string; x: number; y: number; zoom: number };

/** Avatars (Grailio cards or any BNB Chain NFT) for a set of wallets, keyed by lowercase address. */
export function useAvatars(accounts: string[]) {
  const unique = [...new Set(accounts.map((a) => a.toLowerCase()))].sort();
  const { data: rows, refetch: refetchRows } = useReadContracts({
    allowFailure: true,
    contracts: unique.map((a) => ({ address: avatarsAddress, abi: avatarsAbi, functionName: "avatarOf" as const, args: [a as `0x${string}`] as const })),
    query: { enabled: avatarsLive && unique.length > 0, refetchInterval: 30_000 },
  });

  const set = unique.flatMap((account, i) => {
    const row = rows?.[i];
    if (row?.status !== "success") return [];
    const [ok, nft, tokenId, x, y, zoom] = row.result as readonly [boolean, string, bigint, number, number, number];
    return ok ? [{ account, nft, tokenId, x, y, zoom, isCard: nft.toLowerCase() === collectPacksAddress.toLowerCase() }] : [];
  });

  // Card art depends on the card's token, so look each card up once.
  const cardAvatars = set.filter((a) => a.isCard);
  const { data: cards, refetch: refetchCards } = useReadContracts({
    allowFailure: true,
    contracts: cardAvatars.map((a) => ({ address: collectPacksAddress, abi: collectCardsAbi, functionName: "cards" as const, args: [a.tokenId] as const })),
    query: { enabled: cardAvatars.length > 0 },
  });

  // Other NFTs: their image comes from indexed metadata (/api/nft).
  const nftAvatars = set.filter((a) => !a.isCard);
  const images = useQueries({
    queries: nftAvatars.map((a) => ({
      queryKey: ["nft-image", a.nft.toLowerCase(), a.tokenId.toString()],
      staleTime: 3_600_000,
      queryFn: async () => {
        const res = await fetch(`/api/nft?nft=${a.nft}&id=${a.tokenId}`);
        if (!res.ok) return null;
        return (await res.json()) as { image: string | null; collection: string; name: string | null };
      },
    })),
  });

  const avatars = new Map<string, CardAvatarCrop>();
  cardAvatars.forEach((a, i) => {
    const card = cards?.[i];
    if (card?.status !== "success") return;
    const row = card.result as readonly [number, number, number, ...unknown[]];
    const ticker = ASSET_TICKERS[row[0]];
    if (ticker) avatars.set(a.account, { tokenId: a.tokenId, ticker, rarity: Number(row[2]), tier: Number(row[1]), x: a.x, y: a.y, zoom: a.zoom });
  });
  nftAvatars.forEach((a, i) => {
    const meta = images[i]?.data;
    if (!meta?.image) return;
    avatars.set(a.account, { tokenId: a.tokenId, ticker: "", nft: a.nft, image: meta.image, label: meta.name ?? `${meta.collection} #${a.tokenId}`, x: a.x, y: a.y, zoom: a.zoom });
  });

  async function refetch() {
    await refetchRows();
    await refetchCards();
  }
  return { avatars, refetch };
}
