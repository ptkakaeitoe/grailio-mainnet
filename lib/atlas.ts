import type { PublicClient } from "viem";

/**
 * Atlas Oracle push feeds on BNB Chain, read on-chain from its MultiFeed
 * (proxy; open read). `fetch(bytes4 feedId)` returns (value, timestamp,
 * updatedAt) with value in USD per token at 18 decimals. Feed IDs are the
 * same ones Atlas lists at https://atlasoracle.io/feeds.
 */
export const ATLAS_MULTIFEED = "0xeace519ebb14fb8404fa6ddd23c3b34abade44aa" as const;

const multiFeedAbi = [
  {
    type: "function",
    name: "fetch",
    inputs: [{ type: "bytes4", name: "feedId" }],
    outputs: [{ type: "uint256", name: "value" }, { type: "uint256", name: "timestamp" }, { type: "uint256", name: "updatedAt" }],
    stateMutability: "view",
  },
] as const;

const feedKey = (id: number) => `0x${id.toString(16).padStart(8, "0")}` as `0x${string}`;

/** USD price per feed ID (null when a read fails or the feed is empty), in one multicall. */
export async function readAtlasPrices(client: PublicClient, feedIds: number[]): Promise<Map<number, { price: number | null; timestamp: number | null }>> {
  const out = new Map<number, { price: number | null; timestamp: number | null }>();
  if (feedIds.length === 0) return out;
  const results = await client.multicall({
    contracts: feedIds.map((id) => ({ address: ATLAS_MULTIFEED, abi: multiFeedAbi, functionName: "fetch" as const, args: [feedKey(id)] as const })),
    allowFailure: true,
  });
  feedIds.forEach((id, i) => {
    const r = results[i];
    if (r.status !== "success") return out.set(id, { price: null, timestamp: null });
    const [value, timestamp] = r.result;
    // 18-decimal fixed point → number, keeping 8 decimals.
    const price = Number(value / 10n ** 10n) / 1e8;
    out.set(id, { price: price > 0 ? price : null, timestamp: Number(timestamp) || null });
  });
  return out;
}
