import { Holo, StockCardFront, tilt } from "@/components/stock-card-front";
import { TokenIcon } from "@/components/token-icon";
import { MiniPackArt } from "@/components/pack-art";
import { cn } from "@/components/clean-ui";
import type { StockCard } from "@/lib/cards";
import { EDITIONS, editionForTier } from "@/lib/editions";

export type RevealMotion = "idle" | "opening" | "waiting";

/** Fallback art when the tier being opened is unknown. */
export const REVEAL_EDITION = EDITIONS.find((edition) => edition.live) ?? EDITIONS[0];

/**
 * The sealed pack shown while a reveal is pending: the same pack art as the
 * carousel and shelf, with its glow. "opening" shakes, tears the seal and
 * fades (demo); "waiting" wobbles until the chain answers (live). Keyframes
 * live in globals.css.
 */
export function PackRevealArt({ motion, tier }: { motion: RevealMotion; tier?: number }) {
  const edition = tier == null ? REVEAL_EDITION : editionForTier(tier);
  const pack = motion === "opening"
    ? "animate-[pack-shake_.18s_ease-in-out_5_alternate,pack-fade_.3s_.9s_forwards]"
    : motion === "waiting" ? "animate-[pack-shake_.18s_ease-in-out_infinite_alternate]" : "";
  const halo = motion === "waiting"
    ? "animate-[pack-halo_.8s_ease-out_both,pack-pulse_1.2s_ease-in-out_.8s_infinite_alternate]"
    : "animate-[pack-halo_.8s_ease-out_both]";
  return (
    <>
      {/* Scaled as a whole to the revealed card's width (180px), so the pack is just a little taller than the card. */}
      <div className={cn("relative w-[180px]", pack)}>
        <div {...tilt} className="holo-card relative rounded-[4px]">
          <MiniPackArt edition={edition} width={180} className="rounded-[4px]" />
          <span className="holo-glare" aria-hidden="true" />
        </div>
        {/* Tears away over the pack's top seal. */}
        <span className={cn("absolute inset-x-0 top-0 h-[12px] origin-left rounded-t-[4px] bg-[repeating-linear-gradient(90deg,transparent_0_3px,currentColor_3px_4px)] opacity-0", motion === "opening" ? "animate-[pack-tear_.8s_.2s_forwards] opacity-30" : "")} />
      </div>
      <span className={cn("absolute -z-10 size-[280px] rounded-full bg-[radial-gradient(circle,#ec746e55,transparent_70%)]", halo)} />
    </>
  );
}

/** Layout shared by the live and demo pack reveal dialogs, matching the site's other popups. */
export const revealFrame = {
  dialog: "w-[min(440px,calc(100%-32px))]",
  /** Pinned: the stage, details and actions scroll under it when the dialog is taller than the screen. */
  header: "sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-5 py-4",
  label: "text-base text-muted",
  stage: "relative isolate grid min-h-[320px] place-items-center overflow-hidden bg-surface-muted py-8",
  /** With the stage: once a card is revealed, a tighter stage so card, details and actions fit without scrolling. */
  stageRevealed: "min-h-0 py-6",
  body: "p-5 phone:p-6",
  title: "text-[28px] leading-[1.2] font-light tracking-tight",
  note: "mt-1 text-sm text-muted tabular-nums",
  details: "mt-4 border-t border-border",
  row: "flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-sm tabular-nums",
  /** With dialogFooter: the buttons, pinned to the bottom of the dialog. */
  actions: "flex flex-col gap-2",
};

/** The card a pack revealed, unveiled with its rarity foil and pointer tilt. */
export function RevealedCard({ art, rarity }: { art: StockCard; rarity: number }) {
  return (
    <div {...tilt} className="holo-card relative w-[150px] animate-[card-unveil_.65s_ease-out_both] overflow-hidden rounded-[4px] shadow-[0_12px_24px_-12px_rgba(0,0,0,.4)]">
      <StockCardFront art={art} decorative priority sizes="150px" className="w-full" rarity={rarity} />
      <Holo rarity={rarity} />
      <span className="holo-glare" aria-hidden="true" />
    </div>
  );
}

/** "[logo] $0.95 BTC": what a revealed card holds, in dollars at opening. */
export function BackingValue({ ticker, usd }: { ticker: string; usd: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <TokenIcon symbol={ticker} className="size-5" />
      <span className="tabular-nums">${usd.toFixed(2)}</span> {ticker}
    </span>
  );
}
