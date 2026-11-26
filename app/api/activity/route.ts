import { isAddress } from "viem";
import { toActivity } from "@/lib/activity";
import { nothingIndexed, syncLogs, walletLogs } from "@/lib/chain-logs";

/**
 * A wallet's Grailio activity: /api/activity?address=0x…
 *
 * Logs come from the shared contract-log index (lib/chain-logs.ts: eth_getLogs
 * over public BSC RPCs, cached in Redis), which files each event under the
 * wallets it involves. Everything read here is public on-chain data.
 */
export async function GET(req: Request) {
  const account = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(account)) return Response.json({ error: "Bad address" }, { status: 400 });
  try {
    const sync = await syncLogs();
    if (nothingIndexed(sync)) throw new Error(sync.error);
    const items = toActivity(await walletLogs(account), account);
    return Response.json({ items }, { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Activity unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
