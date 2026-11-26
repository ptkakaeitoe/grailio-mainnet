"use client";

import { useEffect, useState } from "react";

import { useDemo } from "@/components/demo-provider";
import type { StockQuote } from "@/lib/quotes";

export type PriceMap = Record<string, StockQuote | undefined>;

// Latest quotes per set, shared by every component on the page, so a dialog
// that mounts later (e.g. a pack reveal) starts with prices already loaded.
const shared: Partial<Record<"tokens" | "stocks", StockQuote[]>> = {};

/**
 * Shared client-side poll of /api/prices. Both the home-page ticker strip and
 * the swap screen read from here so they can never disagree about a price.
 * `set` defaults to the current mode: demo stocks in demo mode, BNB Chain
 * tokens otherwise. Live-only views pass "tokens".
 */
export function useStockPrices(intervalMs = 60_000, set?: "tokens" | "stocks") {
  const demo = useDemo();
  const which = set ?? (demo.active ? "stocks" : "tokens");
  const [state, setState] = useState<{ which: string; quotes: StockQuote[] } | null>(() => (shared[which] ? { which, quotes: shared[which] } : null));
  const [failed, setFailed] = useState(false);
  // After a mode switch, fall back to the shared copy until this set's fetch lands.
  const quotes = state?.which === which ? state.quotes : shared[which] ?? null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(which === "stocks" ? "/api/prices?set=stocks" : "/api/prices");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { quotes: StockQuote[] };
        shared[which] = data.quotes;
        if (!cancelled) {
          setState({ which, quotes: data.quotes });
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs, which]);

  const byTicker: PriceMap = {};
  for (const quote of quotes ?? []) byTicker[quote.ticker] = quote;

  return { quotes, byTicker, failed, loaded: quotes !== null };
}

/** USD with cents, plus extra digits under $1 so small token prices (CAKE ≈ $0.02) stay readable. */
export const usd = (value: number) => {
  const abs = Math.abs(value);
  const digits = abs === 0 || abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
};
