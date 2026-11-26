import { STOCK_CARDS } from "@/lib/cards";
import { fetchHistory, HISTORY_PERIODS, type HistoryPeriod } from "@/lib/quotes";

/**
 * Price history for the trade chart: /api/history?ticker=NVDA&period=7D
 * (stocks via Yahoo ending on the Atlas price; WBNB from its DEX pool).
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const ticker = params.get("ticker") ?? "";
  const period = params.get("period") as HistoryPeriod;
  const known = ticker === "WBNB" || STOCK_CARDS.some((c) => c.ticker === ticker);
  if (!known || !HISTORY_PERIODS.includes(period)) {
    return Response.json({ error: "Unknown ticker or period" }, { status: 400 });
  }
  const history = await fetchHistory(ticker, period);
  // Don't let a CDN hold on to an empty (failed or rate-limited) response.
  const cache = history.points.length > 0 ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store";
  return Response.json(history, { headers: { "Cache-Control": cache } });
}
