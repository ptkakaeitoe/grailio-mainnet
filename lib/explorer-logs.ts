import { rpcUrl } from "@/lib/chain";

/**
 * Explorer logs API (Etherscan API v2, BNB Chain), used where public BSC RPCs
 * cap log queries at a few thousand blocks. Server-side only: the key in
 * ETHERSCAN_API_KEY never reaches the browser.
 *
 * Queries go up to the current block number instead of "latest", so cached
 * answers for an identical URL never go stale.
 */
const LOGS_API = "https://api.etherscan.io/v2/api";

/** Full logs-API URL for `params` (module, action, address, topics…). */
export function logsUrl(params: Record<string, string>): string {
  const query = new URLSearchParams({ chainid: "56", ...params, apikey: process.env.ETHERSCAN_API_KEY ?? "" });
  return `${LOGS_API}?${query}`;
}

/** The chain's current block, or "latest" if the RPC can't be reached. */
export async function latestBlock(): Promise<string> {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      cache: "no-store",
    });
    const { result } = (await res.json()) as { result?: string };
    return result ? BigInt(result).toString() : "latest";
  } catch {
    return "latest";
  }
}
