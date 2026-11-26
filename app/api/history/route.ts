import { DEMO_STOCK_CARDS, STOCK_CARDS } from "@/lib/cards";
import { fetchHistory, HISTORY_PERIODS, type HistoryPeriod } from "@/lib/quotes";
import { fetchStockHistory } from "@/lib/stock-quotes";

/**
 * Price history for the trade chart: /api/history?ticker=WBNB&period=7D for
 * live cards (DEX pools; tokenized stocks via Yahoo ending on the Atlas price),
 * or a demo stock ticker (Yahoo Finance), e.g. ticker=NVDA.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const ticker = params.get("ticker") ?? "";
  const period = params.get("period") as HistoryPeriod;
  const isToken = STOCK_CARDS.some((c) => c.ticker === ticker);
  const isStock = DEMO_STOCK_CARDS.some((c) => c.ticker === ticker);
  if ((!isToken && !isStock) || !HISTORY_PERIODS.includes(period)) {
    return Response.json({ error: "Unknown ticker or period" }, { status: 400 });
  }
  const history = isToken ? await fetchHistory(ticker, period) : await fetchStockHistory(ticker, period);
  // Don't let a CDN hold on to an empty (failed or rate-limited) response.
  const cache = history.points.length > 0 ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store";
  return Response.json(history, { headers: { "Cache-Control": cache } });
}
