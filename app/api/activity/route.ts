import { isAddress, padHex, toEventSelector, type Address } from "viem";
import deployment from "@/deployments/56.json";
import { toActivity, type RawLog } from "@/lib/activity";
import { latestBlock, logsUrl } from "@/lib/explorer-logs";

/**
 * A wallet's Grailio activity: /api/activity?address=0x…
 *
 * Public BSC RPCs cap log queries at a few thousand blocks, so logs come from the
 * explorer logs API (Etherscan v2, lib/explorer-logs.ts), filtered by the wallet in an indexed
 * topic. Everything read here is public on-chain data.
 */
const d = deployment as { collectPacks?: string; collectStaking?: string; collectMarket?: string; deployBlocks?: Record<string, number> };
const ZERO = "0x0000000000000000000000000000000000000000";
const SOLD = toEventSelector("Sold(address,uint256,address,address,uint256,uint256,bool)");

async function logs(params: Record<string, string>): Promise<RawLog[]> {
  const url = logsUrl({ module: "logs", action: "getLogs", offset: "1000", page: "1", ...params });
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`logs ${res.status}`);
  const body = (await res.json()) as { status: string; message: string; result: RawLog[] | string };
  // "No records found" comes back as status 0 with an empty result.
  if (Array.isArray(body.result)) return body.result;
  if (/no records/i.test(body.message)) return [];
  throw new Error(`logs: ${body.message}`);
}

export async function GET(req: Request) {
  const account = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(account)) return Response.json({ error: "Bad address" }, { status: 400 });
  const me = padHex(account.toLowerCase() as Address, { size: 32 });
  const from = String(d.deployBlocks?.collectPacks ?? 0);
  // Up to the current block, not "latest", so cached answers stay fresh (lib/explorer-logs.ts).
  const to = await latestBlock();
  const packs = d.collectPacks ?? ZERO;
  const staking = d.collectStaking ?? ZERO;
  const market = d.collectMarket ?? ZERO;

  // Each query: one contract, the wallet in one indexed slot.
  const queries: Record<string, string>[] = [];
  if (packs !== ZERO) {
    queries.push({ address: packs, fromBlock: from, toBlock: to, topic1: me }); // PacksBought
    queries.push({ address: packs, fromBlock: from, toBlock: to, topic2: me }); // CardRedeemed, GiftBought, GiftClaimed, PackRefunded
    queries.push({ address: packs, fromBlock: from, toBlock: to, topic3: me }); // PackOpened
  }
  if (staking !== ZERO) queries.push({ address: staking, fromBlock: from, toBlock: to, topic1: me }); // Staked, Unstaked, Claimed
  if (market !== ZERO) {
    queries.push({ address: market, fromBlock: from, toBlock: to, topic3: me }); // Listed, Cancelled, Sold (as buyer)
    // The seller isn't indexed on Sold: read the card sales and keep this wallet's.
    queries.push({ address: market, fromBlock: from, toBlock: to, topic0: SOLD, topic1: padHex(packs.toLowerCase() as Address, { size: 32 }), topic0_1_opr: "and" });
  }

  try {
    // The explorer API rate-limits per key: go in pairs.
    const raw: RawLog[] = [];
    for (let i = 0; i < queries.length; i += 2) {
      const batch = await Promise.all(queries.slice(i, i + 2).map(logs));
      raw.push(...batch.flat());
    }
    const items = toActivity(raw, account);
    return Response.json({ items }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Activity unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
