"use client";

import type { StockCard } from "@/lib/cards";
import { cn } from "./clean-ui";
import { Holo, StockCardFront, tilt } from "./stock-card-front";

/** A card front with the .holo-card tilt, glare and a foil that shows on hover (globals.css). */
export function HoloStockCard({ art, sizes, className }: { art: StockCard; sizes?: string; className?: string }) {
  return (
    <div className={cn("holo-card holo-reveal relative overflow-hidden rounded-[4px]", className)} {...tilt}>
      <StockCardFront art={art} className="w-full" sizes={sizes} />
      <Holo rarity={1} />
      <span className="holo-glare" aria-hidden="true" />
    </div>
  );
}
