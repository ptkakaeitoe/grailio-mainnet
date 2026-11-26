/** Server-side Yahoo Finance stock quotes and history, used by demo mode (/api/prices?set=stocks). */
import type { HistoryPeriod, PriceHistory, StockQuote } from "@/lib/quotes";



/**
 * Fetched server-side rather than from the browser: the upstream endpoint
 * sends no CORS headers, and this keeps one cached response shared across
 * visitors instead of every tab hitting it directly.
 */
// Last good quote per ticker: Yahoo rate-limits now and then, and one failed
// request shouldn't blank a price (demo packs need every price to open).
const lastGood = new Map<string, StockQuote>();

export async function fetchStockQuote(ticker: string, symbol = ticker): Promise<StockQuote> {
  const quote = await fetchStockQuoteOnce(ticker, symbol);
  if (quote.price !== null) lastGood.set(ticker, quote);
  return quote.price !== null ? quote : lastGood.get(ticker) ?? quote;
}

async function fetchStockQuoteOnce(ticker: string, symbol: string): Promise<StockQuote> {
  const empty: StockQuote = {
    ticker,
    price: null,
    previousClose: null,
    changePct: null,
  };
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        // Upstream is unofficial; refresh at most once a minute.
        next: { revalidate: 60 },
      },
    );
    if (!res.ok) return empty;

    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const previousClose =
      typeof meta?.chartPreviousClose === "number" ? meta.chartPreviousClose : null;

    return {
      ticker,
      price,
      previousClose,
      changePct:
        price !== null && previousClose ? ((price - previousClose) / previousClose) * 100 : null,
    };
  } catch {
    // A dead upstream must not take the page down; the UI renders "—".
    return empty;
  }
}


/**
 * Yahoo query per timeframe, plus how far back from the latest trade to keep.
 * Windows are measured from the last trade, so when the market is closed the
 * 24H change is still "vs the previous close" rather than a flat line.
 */
const WINDOWS: Record<HistoryPeriod, { query: string; seconds: number }> = {
  "1H": { query: "range=1d&interval=1m", seconds: 3_600 },
  "24H": { query: "range=5d&interval=5m", seconds: 86_400 },
  "7D": { query: "range=1mo&interval=60m", seconds: 7 * 86_400 },
  "30D": { query: "range=3mo&interval=1d", seconds: 30 * 86_400 },
};
const MAX_POINTS = 120;

/** Real price history for one timeframe; empty points if upstream fails. */
export async function fetchStockHistory(ticker: string, period: HistoryPeriod): Promise<PriceHistory> {
  const empty: PriceHistory = { ticker, period, points: [] };
  try {
    const { query, seconds } = WINDOWS[period];
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?${query}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return empty;
    const result = (await res.json())?.chart?.result?.[0];
    const times: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const all = times.flatMap((t, i) => (typeof closes[i] === "number" ? [{ t, p: closes[i] as number }] : []));
    if (all.length < 2) return empty;

    // The live price is fresher than the last bar; end the series on it.
    const live = result?.meta?.regularMarketPrice;
    if (typeof live === "number") all[all.length - 1] = { ...all[all.length - 1], p: live };

    // Start from the last trade at or before the cutoff, so the change is
    // measured against the price exactly one period ago.
    const cutoff = all[all.length - 1].t - seconds;
    let start = all.findIndex((pt) => pt.t >= cutoff);
    if (start > 0 && all[start].t > cutoff) start -= 1;
    const window = all.slice(Math.max(0, start));

    // Thin long series for the sparkline, always keeping both ends.
    const step = Math.ceil(window.length / MAX_POINTS);
    const points = window.filter((_, i) => i % step === 0 || i === window.length - 1);
    return { ticker, period, points };
  } catch {
    return empty;
  }
}
