import { createPublicClient, http } from "viem";

import { appChain, rpcUrl } from "@/lib/chain";
import { collectPacksAbi, collectPacksAddress, collectPacksLive, collectPacksTreasuryAbi } from "@/lib/collect-packs";

/**
 * Unopened packs per tier, for the risk budgets (lib/tier-budget.ts):
 * /api/tier-usage -> { unopened: { "1": 4, "2": 1 } }
 *
 * A reservation starts when a pack (or a gift) is bought and ends when the pack
 * is opened or refunded; a claimed gift becomes packs without reserving again.
 * So per tier: packs not done + packs in gifts not yet claimed or cancelled.
 */
const client = createPublicClient({ chain: appChain, transport: http(rpcUrl) });

const giftsAbi = [
  { type: "function", name: "nextGiftId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

export async function GET() {
  if (!collectPacksLive) return Response.json({ unopened: {} });
  try {
    const [nextPack, nextGift] = await Promise.all([
      client.readContract({ address: collectPacksAddress, abi: collectPacksTreasuryAbi, functionName: "nextPackId" }),
      client.readContract({ address: collectPacksAddress, abi: giftsAbi, functionName: "nextGiftId" }),
    ]);
    const packIds = Array.from({ length: Number(nextPack) - 1 }, (_, i) => BigInt(i + 1));
    const giftIds = Array.from({ length: Number(nextGift) - 1 }, (_, i) => BigInt(i + 1));
    const [packs, gifts] = await Promise.all([
      client.multicall({ allowFailure: true, contracts: packIds.map((id) => ({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "packs" as const, args: [id] as const })) }),
      client.multicall({ allowFailure: true, contracts: giftIds.map((id) => ({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "gifts" as const, args: [id] as const })) }),
    ]);
    const unopened: Record<string, number> = {};
    for (const row of packs) {
      if (row.status !== "success") continue;
      const [, , tier, done] = row.result as readonly [string, bigint, number, boolean, bigint];
      if (!done) unopened[tier] = (unopened[tier] ?? 0) + 1;
    }
    for (const row of gifts) {
      if (row.status !== "success") continue;
      const [, , tier, quantity, done] = row.result as readonly [string, string, number, number, boolean, bigint];
      if (!done) unopened[tier] = (unopened[tier] ?? 0) + Number(quantity);
    }
    return Response.json({ unopened }, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message.split("\n")[0] : "Unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
