"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount, useBlockNumber, usePublicClient } from "wagmi";

import { appChain } from "@/lib/chain";
import { collectPacksAbi, collectPacksAddress, collectPacksLive, REVEAL_WINDOW } from "@/lib/collect-packs";

export type MyPack = {
  id: bigint;
  tier: number;
  /** The block whose hash rolls the pack (the one after it was bought). */
  revealBlock: bigint;
  /** Always false on CollectPacks: packs commit to their reveal block when bought. Kept for older callers. */
  sealed: boolean;
  /** Past its reveal block: `open` works. */
  ready: boolean;
  /** Not opened within the reveal window: it opens as its tier's lowest card. */
  expired: boolean;
  /** Blocks left before `expired`. */
  blocksLeft: number | null;
};

type Row = { id: bigint; tier: number; revealBlock: bigint };

/**
 * The connected wallet's unopened CollectPacks packs, newest first.
 * Packs aren't NFTs: the contract keeps each buyer's pack ids (`packIdsOf`).
 */
export function useMyPacks() {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: appChain.id });
  const enabled = collectPacksLive && Boolean(address) && Boolean(client);
  const { data: blockNumber } = useBlockNumber({ chainId: appChain.id, watch: true, query: { enabled } });
  const query = useQuery({
    queryKey: ["collect-packs", appChain.id, collectPacksAddress.toLowerCase(), address?.toLowerCase()],
    enabled,
    refetchInterval: 6_000,
    staleTime: 3_000,
    queryFn: async (): Promise<Row[]> => {
      if (!client || !address) throw new Error("Connect a wallet to load packs.");
      const ids = await client.readContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "packIdsOf", args: [address] });
      if (ids.length === 0) return [];
      const rows = await client.multicall({
        allowFailure: false,
        contracts: ids.map((id) => ({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "packs" as const, args: [id] as const })),
      });
      return ids
        .map((id, i) => ({ id, revealBlock: BigInt(rows[i][1]), tier: Number(rows[i][2]), done: rows[i][3] }))
        .filter((row) => !row.done)
        .map(({ id, revealBlock, tier }) => ({ id, revealBlock, tier }))
        .sort((a, b) => (a.id < b.id ? 1 : -1));
    },
  });

  const head = blockNumber ?? 0n;
  const packs: MyPack[] = (query.data ?? []).map((row) => {
    const expiresAt = row.revealBlock + BigInt(REVEAL_WINDOW);
    return {
      ...row,
      sealed: false,
      ready: head > row.revealBlock,
      expired: head > expiresAt,
      blocksLeft: Math.max(0, Number(expiresAt - head)),
    };
  });
  return {
    packs,
    unopened: packs,
    sealed: [] as MyPack[],
    connected: Boolean(address),
    loading: enabled && query.isPending,
    error: query.error,
    refetch: async () => { await query.refetch(); },
  };
}
