import { STOCK_CARDS } from "@/lib/cards";
import { fetchQuote } from "@/lib/quotes";

/**
 * Prices for the card stocks (Atlas Oracle on-chain) plus WBNB (DEX pool) for
 * paying in BNB. /api/prices?set=stocks (demo mode) returns the same set.
 */
export async function GET() {
  const quotes = await Promise.all([...STOCK_CARDS.map((card) => fetchQuote(card.ticker)), fetchQuote("WBNB")]);
  // Don't let a cache hold on to a response with missing prices.
  const complete = quotes.every((q) => q.price !== null);
  return Response.json(
    { quotes, fetchedAt: Date.now() },
    { headers: { "Cache-Control": complete ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store" } },
  );
}
