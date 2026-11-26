"use client";

import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useId, useRef, useState } from "react";

import type { HistoryPeriod, PriceHistory } from "@/lib/quotes";
import { DEMO_STOCK_CARDS } from "@/lib/cards";
import { usd, useStockPrices } from "@/lib/use-stock-prices";
import { cleanChip, cn } from "@/components/clean-ui";
import { TokenIcon } from "@/components/token-icon";

const PERIODS: readonly HistoryPeriod[] = ["1H", "24H", "7D", "30D"];
const PERIOD_WORDS: Record<HistoryPeriod, string> = { "1H": "past hour", "24H": "past 24h", "7D": "past 7 days", "30D": "past 30 days" };

/** Real history from /api/history, per ticker and timeframe. */
function useHistory(ticker: string, period: HistoryPeriod) {
  const [cache, setCache] = useState<Record<string, (PriceHistory & { fetchedAt: number }) | "failed">>({});
  const key = `${ticker}:${period}`;
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/history?ticker=${ticker}&period=${period}`)
        .then((res) => (res.ok ? (res.json() as Promise<PriceHistory>) : Promise.reject()))
        .then((data) => { if (!cancelled) setCache((c) => ({ ...c, [key]: data.points.length >= 2 ? { ...data, fetchedAt: Date.now() } : "failed" })); })
        .catch(() => { if (!cancelled) setCache((c) => ({ ...c, [key]: "failed" })); });
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [ticker, period, key]);
  const entry = cache[key];
  return { history: entry && entry !== "failed" ? entry : null, failed: entry === "failed" };
}

/** Simulated line, only when real history can't be loaded. */
function simulated(ticker: string, base: number) {
  const seed = ticker.split("").reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return Array.from({ length: 48 }, (_, i) => base * (1 + i * 0.0015 + Math.sin(i * 0.7 + seed) * 0.022 + Math.cos(i * 1.9 + seed) * 0.009));
}

const timeLabel = (t: number, period: HistoryPeriod) =>
  new Date(t * 1000).toLocaleString("en-US", period === "1H" || period === "24H" ? { weekday: "short", hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" });
/** Fallbacks in USD, used only until the live quote arrives. */
const BASES: Record<string, number> = {
  WBNB: 6.6,
  BTC: 60_000,
  LINK: 8.5,
  ETH: 1_680,
  CAKE: 0.02,
  // Demo stocks
  NVDA: 180,
  AAPL: 250,
  TSLA: 350,
  MSFT: 500,
  AMZN: 230,
};

/** A token in the market dropdown (what used to be the watchlist). */
export type ChartMarket = { ticker: string; name: string; accent?: string };

/** The chart's title doubles as the market picker: the token, its price and 24h change, one tap to switch. */
function MarketPicker({ ticker, markets, onSelect }: { ticker: string; markets: ChartMarket[]; onSelect: (ticker: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { byTicker } = useStockPrices();
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const current = markets.find((m) => m.ticker === ticker);
  return (
    <div className="relative min-w-0" ref={box}>
      <button
        ref={button}
        type="button"
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-2.5 text-base transition-colors hover:border-black aria-expanded:border-black"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="market-list"
        aria-label={`Market: ${ticker} / USD. Change market`}
      >
        <TokenIcon symbol={ticker} color={current?.accent} className="size-6" />
        {ticker} / USD
        <span className="text-muted" aria-hidden="true"><CaretDownIcon size={16} /></span>
      </button>
      {open && (
        <ul
          id="market-list"
          role="listbox"
          aria-label="Markets"
          className="frost market-menu absolute top-[calc(100%+8px)] left-0 z-40 grid w-[min(340px,calc(100vw-36px))] animate-[popover-in_.15s_ease-out] list-none gap-1 rounded-[10px] border border-border bg-white/72 backdrop-blur-[14px] p-1.5 shadow-[0_12px_30px_#00000014]"
        >
          {markets.map((m) => {
            const q = byTicker[m.ticker];
            return (
              <li key={m.ticker}>
                <button
                  type="button"
                  role="option"
                  aria-selected={m.ticker === ticker}
                  className="market-option flex w-full items-center gap-3 rounded-[4px] border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-black/5 aria-selected:border-black"
                  onClick={() => { onSelect(m.ticker); setOpen(false); button.current?.focus(); }}
                >
                  <TokenIcon symbol={m.ticker} color={m.accent} className="size-8 shrink-0" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[16px]">{m.name}</span>
                    <span className="text-sm text-muted">{m.ticker} / USD</span>
                  </span>
                  <span className="ml-auto flex flex-col items-end gap-0.5 pl-2">
                    <span className="text-[16px] tabular-nums">{q?.price != null ? usd(q.price) : "—"}</span>
                    <span className={cn("text-xs tabular-nums", (q?.changePct ?? 0) >= 0 ? "text-up" : "text-down")}>
                      {q?.changePct != null ? `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function DemoPriceChart({ ticker, markets, onSelect }: { ticker: string; markets?: ChartMarket[]; onSelect?: (ticker: string) => void }) {
  const [period, setPeriod] = useState<HistoryPeriod>("24H");
  const gradient = useId();
  const { byTicker } = useStockPrices();
  const live = byTicker[ticker]?.price ?? null;
  // Demo stocks come from Yahoo Finance; tokens from BNB Chain DEX pools.
  const isStock = DEMO_STOCK_CARDS.some((c) => c.ticker === ticker);
  const { history, failed } = useHistory(ticker, period);
  const real = history !== null;
  const values = real ? history.points.map((pt) => pt.p) : simulated(ticker, live ?? BASES[ticker] ?? 200);
  if (!real && live !== null) values[values.length - 1] = live;
  const n = values.length;
  // An idle pool means the last trade is old; say so rather than implying "now".
  const lastTrade = real ? history.points[n - 1].t : null;
  const stale = real && lastTrade !== null && history.fetchedAt / 1000 - lastTrade > 30 * 60;
  const loading = !real && !failed;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const padding = (high - low) * 0.25 || high * 0.01;
  const min = low - padding;
  const max = high + padding;
  // Plot spans x 2–312 of the 350-wide canvas (labels right-aligned at 350) and y 8–138.
  const points = values.map((value, i) => [
    2 + (i / (n - 1)) * 310,
    138 - ((value - min) / (max - min)) * 130,
  ]);
  const line = points
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const latest = values[n - 1];
  const change = (latest / values[0] - 1) * 100;

  return (
    <aside
      className="demo-chart w-full min-w-0 pt-1 max-desk:mx-auto max-desk:max-w-[520px] max-desk:border-t max-desk:border-border max-desk:pt-7"
      aria-label={`Demo ${ticker} price chart`}
    >
      {/* .chart-main ends with the high/low rule; on two columns it shares a grid row with the swap box, so that rule lines up with the one above Recent trades. */}
      <div className="chart-main">
      <header className="flex items-center justify-between gap-3 text-base">
        {markets && onSelect ? <MarketPicker ticker={ticker} markets={markets} onSelect={onSelect} /> : <span>{ticker} / USD</span>}
        <span className="rounded-md px-1.5 py-1 text-base text-muted">
          [{real ? "market data" : loading ? "loading…" : "simulated history"}]
        </span>
      </header>
      <p className="mt-10 text-[32px] tracking-[-0.03em] tabular-nums">
        {usd(latest)}{" "}
        <span className="text-sm tracking-normal text-muted">USD</span>
      </p>
      <p
        className={cn(
          "mt-2 text-sm tabular-nums",
          change >= 0 ? "text-up" : "text-down",
        )}
      >
        {change >= 0 ? "+" : ""}
        {change.toFixed(2)}%{" "}
        <span className="ml-1 text-sm text-muted">
          {PERIOD_WORDS[period]}{real ? "" : " · simulated"}
        </span>
      </p>
      <div
        className="flex gap-1.5 pt-8"
        role="group"
        aria-label="Chart timeframe"
      >
        {PERIODS.map((value) => (
          <button
            key={value}
            type="button"
            className={cleanChip}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <svg
        className="my-8 block h-auto w-full"
        viewBox="0 0 350 166"
        role="img"
        aria-label={`${real ? "" : "Simulated "}${PERIOD_WORDS[period]} price history for ${ticker}, from ${usd(values[0])} to ${usd(latest)}`}
        style={{ opacity: loading ? 0.4 : 1 }}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000" stopOpacity=".1" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="2"
              x2="312"
              y1={8 + (i * 130) / 3}
              y2={8 + (i * 130) / 3}
              stroke="var(--border)"
              strokeDasharray="3 4"
            />
            <text
              x="350"
              y={11 + (i * 130) / 3}
              textAnchor="end"
              fontSize="8"
              fill="var(--muted)"
            >
              {(max - (i * (max - min)) / 3).toFixed(max - min < 5 ? 2 : 0)}
            </text>
          </g>
        ))}
        <path d={`${line} L312,138 L2,138 Z`} fill={`url(#${gradient})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={points[n - 1][0]}
          cy={points[n - 1][1]}
          r="3.5"
          fill="var(--accent)"
        />
        <text x="2" y="160" fontSize="9" fill="var(--muted)">
          {real ? timeLabel(history.points[0].t, period) : `${period.toLowerCase()} ago`}
        </text>
        <text x="312" y="160" textAnchor="end" fontSize="9" fill="var(--muted)">
          {real && stale ? timeLabel(lastTrade!, period) : "Now"}
        </text>
      </svg>
      <dl className="grid grid-cols-2 gap-3 border-y border-border py-[18px]">
        <div>
          <dt className="text-sm text-muted">Period high</dt>
          <dd className="mt-2 text-sm tabular-nums">{usd(high)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Period low</dt>
          <dd className="mt-2 text-sm tabular-nums">{usd(low)}</dd>
        </div>
      </dl>
      </div>
      {/* Only notes worth reading: stale data, missing history, or still loading. */}
      {(!real || stale) && (
        <p className="chart-notes mt-[18px] text-sm leading-relaxed text-muted">
          {real
            ? isStock
              ? "Market closed · showing the latest trading session. Prices from Yahoo Finance."
              : "No recent trades in this pool · showing the latest data. Prices from BNB Chain DEX pools."
            : failed
              ? "Market history unavailable right now · illustrative line only."
              : "Loading market history…"}
        </p>
      )}
    </aside>
  );
}
