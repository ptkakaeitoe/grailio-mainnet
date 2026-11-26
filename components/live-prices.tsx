"use client";

import { useCards } from "@/lib/use-cards";
import { usd, useStockPrices } from "@/lib/use-stock-prices";
import { cn } from "@/components/clean-ui";

/** Scrolling price ticker; the list renders twice so the loop is seamless. */
export function LivePrices() {
  const { byTicker, failed } = useStockPrices();
  // The card stocks.
  const { cards } = useCards();

  const items = cards.map((card) => {
    const quote = byTicker[card.ticker];
    const up = (quote?.changePct ?? 0) >= 0;
    return (
      <li key={card.slug} className="flex gap-2.5 whitespace-nowrap">
        <span>{card.ticker}</span>
        <span className="tabular-nums">
          {quote?.price != null ? usd(quote.price) : "—"}
        </span>
        <span className={cn("tabular-nums", quote?.changePct == null ? "" : up ? "text-up" : "text-down")}>
          {quote?.changePct != null
            ? `${up ? "+" : ""}${quote.changePct.toFixed(2)}%`
            : ""}
        </span>
      </li>
    );
  });

  // Each copy is at least a screen wide; the track slides left by one copy (live-marquee keyframes in globals.css).
  const row = "flex min-w-[100vw] list-none justify-around gap-10 px-5 desk:gap-16 desk:px-8 motion-reduce:min-w-0 motion-reduce:flex-wrap motion-reduce:gap-x-8 motion-reduce:gap-y-3";
  return (
    <div className="group/ticker -mx-[18px] overflow-hidden pt-4 pb-8 text-xs phone:-mx-6 desk:-mx-8 desk:text-sm wide:-mx-16">
      <div className="flex w-max animate-[live-marquee_40s_linear_infinite] group-hover/ticker:[animation-play-state:paused] motion-reduce:animate-none">
        <ul className={row} aria-label={failed ? "Market prices unavailable" : "Real market prices"}>{items}</ul>
        <ul className={cn(row, "motion-reduce:hidden")} aria-hidden="true">{items}</ul>
      </div>
    </div>
  );
}
