"use client";

import type { ReactNode } from "react";

import { FABLE_CARDS } from "@/lib/cards";
import { cn } from "@/components/clean-ui";
import { StockCardFront } from "@/components/stock-card-front";

/** Three of the Fable designs: Coal Worker, Ember King (raised, in front) and Cinder Knight. */
const FAN = [
  { rarity: 0, className: "-mr-8 -rotate-12" },
  { rarity: 3, className: "z-[1] -translate-y-3" },
  { rarity: 2, className: "-ml-8 rotate-12" },
];

/** Empty-collection state, like the other pages' empty boxes: a small card fan, a bracketed label, a two-tone title and one action. */
export function CollectionWelcome({ label, title, body, action }: { label: string; title: string; body: string; action: ReactNode }) {
  return (
    // collection-welcome*, eyebrow: /v2 hooks.
    <div className="collection-welcome flex flex-col items-center gap-5 rounded-md border border-dashed border-border-strong px-6 py-12 text-center">
      <div className="collection-welcome-art flex items-center justify-center pb-2" aria-hidden="true">
        {FAN.map(({ rarity, className }) => (
          <StockCardFront key={rarity} art={FABLE_CARDS[rarity]} rarity={rarity} decorative sizes="96px" className={cn("w-[96px]", className)} />
        ))}
      </div>
      <p className="eyebrow text-base text-muted">[ {label} ]</p>
      <h3 className="text-[clamp(28px,3vw,40px)] leading-[1.15] font-light tracking-[-0.02em]">{title}<br /><span className="text-muted-soft">{body}</span></h3>
      <div>{action}</div>
    </div>
  );
}
