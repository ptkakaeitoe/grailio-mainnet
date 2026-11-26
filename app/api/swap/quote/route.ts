import { kyberRoute, SwapError } from "@/lib/kyber";
import { tokenFor } from "@/lib/tokens";

/**
 * Best route across BNB Chain DEXes: /api/swap/quote?from=USDC&to=BTC&amount=100000000
 * `amount` is in the input token's smallest unit. Read-only; open to everyone.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const from = tokenFor(params.get("from") ?? "");
  const to = tokenFor(params.get("to") ?? "");
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
    const message = error instanceof SwapError ? error.message : "Quote unavailable";
    return Response.json({ error: message }, { status: 502 });
  }
}
