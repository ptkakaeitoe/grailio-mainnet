import Image from "next/image";
import { TokenIcon } from "@/components/token-icon";
import type { CSSProperties, PointerEvent } from "react";

import { cn } from "@/components/clean-ui";
import type { StockCard } from "@/lib/cards";

/**
 * One fixed frame for every generated artifact illustration. With `rarity`, the
 * card gets that rarity's frame (globals.css): Common plain, Rare blue, Epic a
 * purple-to-cyan foil frame, Legendary an animated gold foil frame.
 */
export function StockCardFront({ art, className, priority = false, sizes, decorative = false, rarity }: {
  art: StockCard;
  className?: string;
  priority?: boolean;
  sizes?: string;
  decorative?: boolean;
  /** 0 Common … 3 Legendary; leave out for a card with no rarity (e.g. art previews). */
  rarity?: number;
}) {
  return (
    <div
      className={cn("stock-card-front", className)}
      style={{ "--card-accent": art.accent } as CSSProperties}
      data-rarity={rarity ? rarity : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `${art.name}, ${art.ticker} trading card`}
      aria-hidden={decorative || undefined}
    >
      <div className="stock-card-front__masthead"><strong>GRAILIO</strong><span>{art.number} / {art.of ?? "05"}</span></div>
      <div className="stock-card-front__art">
        <Image src={art.src} alt="" fill sizes={sizes ?? "(max-width: 700px) 45vw, 220px"} priority={priority} />
      </div>
      <div className="stock-card-front__nameplate">
        <strong>{art.name}</strong>
        <div><span className="stock-card-front__coin">{art.ticker && <TokenIcon symbol={art.ticker} className="stock-card-front__coin-logo" />}{art.ticker || "ANY COIN"}</span><span>SERIES 01</span></div>
      </div>
    </div>
  );
}

const HOLO = ["", "holo holo--rare", "holo holo--epic", "holo holo--legendary"];

/** Foil overlay for a card front by rarity (0 common … 3 legendary); commons stay plain. Styles in globals.css. */
export function Holo({ rarity }: { rarity: number }) {
  return HOLO[rarity] ? <span className={HOLO[rarity]} aria-hidden="true" /> : null;
}

/** Feeds the pointer position to the .holo-card tilt, glare and foil (globals.css); mouse only. */
export const tilt = {
  onPointerMove(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--px", String((event.clientX - box.left) / box.width));
    event.currentTarget.style.setProperty("--py", String((event.clientY - box.top) / box.height));
  },
  onPointerLeave(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.removeProperty("--px");
    event.currentTarget.style.removeProperty("--py");
  },
};
