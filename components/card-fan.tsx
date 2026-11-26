import type { CSSProperties } from "react";

import { cn } from "@/components/clean-ui";
import { StockCardFront } from "@/components/stock-card-front";
import { FABLE_CARDS } from "@/lib/cards";

/**
 * Where each card sits in the cluster, as % of the box (cards are 56.9% wide, 2:3), and which way it
 * drifts on hover. Listed back to front: Common at the back, Legendary on top.
 */
const PLACES = [
  { rarity: 0, left: 5.2, top: 0, hx: -1, hy: -1 },
  { rarity: 1, left: 43.1, top: 10.2, hx: 1, hy: -1 },
  { rarity: 2, left: 36.3, top: 38.8, hx: 1, hy: 1 },
  { rarity: 3, left: 0, top: 27.8, hx: -1, hy: 1 },
] as const;

const tag = "absolute z-10 w-max bg-black px-2 py-1 text-sm leading-[1.3] text-white max-desk:hidden";

/**
 * The Fable cards in the landing hero: upright and overlapping in a loose cluster. Container units keep the
 * hover drift proportional at any size.
 */
export function CardFan() {
  return (
    <figure className="group/art @container w-[70%] max-w-[290px] justify-self-center max-desk:order-first max-desk:mb-6 desk:w-[min(72%,calc((100svh_-_220px)*.59))] desk:max-w-none" aria-hidden="true">
      {/* One layer for the whole cluster, so the hero's [SERIES 01] / [PUBLIC BETA] tags still sit on top. */}
      <div className="relative isolate aspect-[0.717]">
        {PLACES.map((p, index) => {
          const art = FABLE_CARDS[p.rarity];
          return (
            // Each card is its own stacking layer (isolate + z-index in list order), so a card's rarity frame and
            // foil stay with it instead of painting over the cards in front.
            <div
              key={art.slug}
              className="absolute isolate w-[56.9%] shadow-[0_24px_48px_-20px_rgb(0_0_0/.7)] transition-transform duration-500 ease-[cubic-bezier(.2,.8,.3,1)] group-hover/art:translate-x-[calc(var(--hx)*2.4cqw)] group-hover/art:translate-y-[calc(var(--hy)*2.4cqw)]"
              style={{ left: `${p.left}%`, top: `${p.top}%`, zIndex: index + 1, "--hx": p.hx, "--hy": p.hy } as CSSProperties}
            >
              <StockCardFront art={art} rarity={p.rarity} decorative priority={p.rarity === 3} sizes="(max-width: 800px) 42vw, 240px" className="w-full" />
            </div>
          );
        })}
        {/* Desktop tags, a fixed 12px off the cards: the series beside the back card, the beta note past the right edge. */}
        <span className={cn(tag, "top-[8%] right-[calc(94.8%+12px)]")}>[SERIES 01]</span>
        <span className={cn(tag, "top-[74%] left-[calc(100%+12px)]")}>[PUBLIC BETA]</span>
      </div>
    </figure>
  );
}
