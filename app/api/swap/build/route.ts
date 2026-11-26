import { cookies } from "next/headers";
import { isAddress } from "viem";

import { BETA_COOKIE, validToken } from "@/lib/beta-gate";
import { kyberBuild, SwapError, type RouteSummary } from "@/lib/kyber";
import { SWAP_KEYS, TOKENS } from "@/lib/tokens";

const ALLOWED = new Set(SWAP_KEYS.map((key) => TOKENS[key].address.toLowerCase()));
const MAX_SLIPPAGE_BPS = 500; // 5%

/**
 * Turns a quoted route into transaction calldata for the user's wallet to sign.
 * Beta-gated. The server never signs or sends anything; the result is only
 * ever addressed to SWAP_ROUTER (checked in lib/kyber.ts).
 */
export async function POST(req: Request) {
  if (!(await validToken((await cookies()).get(BETA_COOKIE)?.value))) {
    return Response.json({ error: "Beta access required" }, { status: 401 });
  }

  let body: { routeSummary?: RouteSummary; sender?: string; slippageBps?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const { routeSummary, sender, slippageBps } = body;
  if (!routeSummary || typeof sender !== "string" || !isAddress(sender)) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!ALLOWED.has(String(routeSummary.tokenIn).toLowerCase()) || !ALLOWED.has(String(routeSummary.tokenOut).toLowerCase())) {
    return Response.json({ error: "Token not supported" }, { status: 400 });
  }
  const slippage = Math.round(Number(slippageBps));
  if (!Number.isFinite(slippage) || slippage < 1 || slippage > MAX_SLIPPAGE_BPS) {
    return Response.json({ error: "Slippage must be between 0.01% and 5%" }, { status: 400 });
  }

  try {
    const tx = await kyberBuild(routeSummary, sender, slippage);
    return Response.json(tx, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof SwapError ? error.message : "Couldn't build the swap";
    return Response.json({ error: message }, { status: 502 });
  }
}
