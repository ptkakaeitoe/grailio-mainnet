import { kyberRoute, SwapError } from "@/lib/kyber";
import { swapTokenFor } from "@/lib/tokens";

/**
 * Best route across BNB Chain DEXes: /api/swap/quote?from=USDT&to=NVDA&amount=10000000000000000000
 * Pairs are USDT, USDC or BNB and the tokenized stocks (lib/tokens.ts SWAP_KEYS).
 * `amount` is in the input token's smallest unit. Read-only; open to everyone.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const from = swapTokenFor(params.get("from") ?? "");
  const to = swapTokenFor(params.get("to") ?? "");
  let amount: bigint;
  try {
    amount = BigInt(params.get("amount") ?? "0");
  } catch {
    return Response.json({ error: "Bad amount" }, { status: 400 });
  }
  if (!from || !to || from.address === to.address || amount <= 0n) {
    return Response.json({ error: "Unknown pair or amount" }, { status: 400 });
  }

  try {
    const routeSummary = await kyberRoute(from.address, to.address, amount);
    return Response.json({ routeSummary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Kyber's "route not found" reads as a plain no-route for that token.
    const message = error instanceof SwapError ? (/route not found/i.test(error.message) ? "No route" : error.message) : "Quote unavailable";
    return Response.json({ error: message }, { status: 502 });
  }
}
