import { DEMO_STOCK_CARDS, STOCK_CARDS } from "@/lib/cards";
import { fetchQuote } from "@/lib/quotes";
import { fetchStockQuote } from "@/lib/stock-quotes";

/**
 * Prices for a card set: /api/prices (live cards: BNB Chain tokens from DEX
 * pools, tokenized stocks from Atlas Oracle) or
 * /api/prices?set=stocks (demo stocks, from Yahoo Finance). The stock set also
 * includes WBNB so demo swaps can price BNB.
 */
export async function GET(req: Request) {
  const stocks = new URL(req.url).searchParams.get("set") === "stocks";
  const quotes = stocks
    ? await Promise.all([...DEMO_STOCK_CARDS.map((card) => fetchStockQuote(card.ticker)), fetchQuote("WBNB")])
    : await Promise.all(STOCK_CARDS.map((card) => fetchQuote(card.ticker)));
  // Don't let a cache hold on to a response with missing prices.
  const complete = quotes.every((q) => q.price !== null);
  return Response.json(
    { quotes, fetchedAt: Date.now() },
    { headers: { "Cache-Control": complete ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store" } },
  );
}
