/**
 * Server-side KyberSwap aggregator client (BNB Chain). It routes across
 * BNB Chain DEXes (PancakeSwap, Uniswap, Thena, …) for the best price. Used only
 * from API routes, so the browser never talks to the aggregator directly and
 * every route is checked against SWAP_ROUTER before it reaches a wallet.
 */
import { SWAP_ROUTER } from "@/lib/tokens";
import { hasCollectFee, swapFeeFor } from "@/lib/swap-fee";

const BASE = "https://aggregator-api.kyberswap.com/bsc/api/v1";
const HEADERS = { "x-client-id": "collect", "Content-Type": "application/json" };

export type RouteSummary = Record<string, unknown> & {
  tokenIn: string;
  amountIn: string;
  tokenOut: string;
  amountOut: string;
  amountInUsd?: string;
  amountOutUsd?: string;
  gasUsd?: string;
};

export class SwapError extends Error {}

const sameAddress = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

export async function kyberRoute(tokenIn: string, tokenOut: string, amountIn: bigint) {
  // Grailio's 0.5% fee (lib/swap-fee.ts) is part of every route: amountOut already accounts for it.
  const fee = swapFeeFor(tokenIn, tokenOut);
  const query = new URLSearchParams({ tokenIn, tokenOut, amountIn: amountIn.toString(), feeAmount: fee.feeAmount, chargeFeeBy: fee.chargeFeeBy, isInBps: "true", feeReceiver: fee.feeReceiver });
  const url = `${BASE}/routes?${query}`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  const json = await res.json().catch(() => null);
  const data = json?.data;
  if (!res.ok || json?.code !== 0 || !data?.routeSummary) throw new SwapError(json?.message ?? "No route found");
  if (!sameAddress(data.routerAddress, SWAP_ROUTER)) throw new SwapError("Unexpected router");
  return data.routeSummary as RouteSummary;
}

export async function kyberBuild(routeSummary: RouteSummary, sender: string, slippageBps: number) {
  // The route comes back from the browser: build only routes that still carry Grailio's fee.
  if (!hasCollectFee(routeSummary)) throw new SwapError("Quote expired. Get a new quote.");
  const res = await fetch(`${BASE}/route/build`, {
    method: "POST",
    headers: HEADERS,
    cache: "no-store",
    body: JSON.stringify({ routeSummary, sender, recipient: sender, slippageTolerance: slippageBps, source: "collect" }),
  });
  const json = await res.json().catch(() => null);
  const data = json?.data;
  if (!res.ok || json?.code !== 0 || typeof data?.data !== "string") throw new SwapError(json?.message ?? "Couldn't build the swap");
  if (!sameAddress(data.routerAddress, SWAP_ROUTER)) throw new SwapError("Unexpected router");
  return {
    to: SWAP_ROUTER,
    data: data.data as `0x${string}`,
    /** Wei to send; non-zero only when paying with BNB. */
    value: String(data.transactionValue ?? "0"),
    amountOut: String(data.amountOut ?? routeSummary.amountOut),
  };
}
