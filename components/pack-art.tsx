"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { TrendMark } from "@/components/trend-mark";
import { editionForTier, type Edition } from "@/lib/editions";
import { PACK_TIERS } from "@/lib/contracts";
import { cn } from "@/components/clean-ui";

/** Flat pack colors, taken from the hero blocks. */
export const PALETTE: Record<Edition["style"], string> = {
  classic: "bg-block-salmon text-black",
  future: "bg-block-ink text-block-green",
  realistic: "bg-block-crimson text-[#f6d4cf]",
};

const seal = "h-[15px] bg-[repeating-linear-gradient(90deg,transparent_0_3px,currentColor_3px_4px)] opacity-20";

/** A sealed mystery pack. `large` is the size used in the pack carousel. */
export function PackArt({ edition, large = false, className = "", style }: { edition: Edition; large?: boolean; className?: string; style?: CSSProperties }) {
  if (edition.cover) {
    return (
      <div className={cn("relative isolate flex aspect-[5/8] w-full flex-col overflow-hidden rounded-[4px] bg-[#ff936d] text-[#241a2c]", className)} style={style}>
        <Image src={edition.cover} alt="" fill sizes="260px" draggable={false} className="pointer-events-none -z-10 object-cover select-none" />
        <div className="h-3 shrink-0 border-b border-[#241a2c]/40 bg-[#38283f] bg-[repeating-linear-gradient(90deg,transparent_0_3px,#ffffff25_3px_4px)]" />
        {/* Title at the foot, light on a soft dark rise from the bottom edge so it reads over any artwork. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 -z-[5] h-[52%] bg-linear-to-t from-[#120c16]/92 via-[#120c16]/55 to-transparent" aria-hidden="true" />
        <div className="mt-auto flex flex-col items-center px-3 pb-2 text-[#f7f2ea]">
          <span className="text-[10px] font-semibold tracking-[0.28em] opacity-90">GRAILIO</span>
          <span className={cn("mt-1 font-serif leading-none font-black tracking-[-0.03em] uppercase [text-shadow:0_2px_14px_rgb(0_0_0/.6)]", large ? "text-[50px]" : "text-[44px]")}>{edition.name.split(" · ")[0]}</span>
          <div className="mt-3 flex w-full justify-between px-1 text-[8px] font-semibold tracking-[0.12em] opacity-80">
            <span>1 CARD</span>
            <span>{edition.id}</span>
          </div>
        </div>
        <div className="h-3 shrink-0 border-t border-[#241a2c]/40 bg-[#38283f] bg-[repeating-linear-gradient(90deg,transparent_0_3px,#ffffff25_3px_4px)]" />
      </div>
    );
  }

  const emblemShape = edition.style === "realistic" ? "rounded-[45%_45%_6px_6px]" : "rounded-full";
  return (
    <div className={cn("relative flex flex-col rounded-[4px]", PALETTE[edition.style], className)} style={style}>
      <div className={seal} />
      <div className={cn("flex flex-col items-center", large ? "px-5 pt-[30px] pb-5" : "px-[15px] pt-[18px] pb-3")}>
        <span className="text-[13px] tracking-[0.12em]">grailio</span>
        <span className="mt-[9px] text-[6px] tracking-[0.14em] opacity-75">MYSTERY PACK {edition.id}</span>
        <div
          className={cn("relative grid place-items-center border border-current before:absolute before:inset-[5px] before:rounded-[inherit] before:border before:border-current before:opacity-40 [&_svg]:size-[44%] [&_svg]:stroke-[1.5]", emblemShape, large ? "my-7 size-[112px] max-[380px]:size-[82px]" : "mt-[25px] mb-5 size-24")}
        >
          {edition.style === "classic" ? <TrendMark /> : <span className="text-[52px] leading-none">{edition.mark}</span>}
        </div>
        <span className={cn("tracking-[-0.02em]", large ? "text-[34px] max-[380px]:text-[27px]" : "text-[28px]")}>{edition.name}</span>
        <span className="mt-1.5 text-[9px] opacity-80">{edition.subtitle}</span>
        <div className="mt-6 flex w-full justify-between gap-2 border-t border-current/35 pt-3 text-[5px] opacity-75">
          <span>SEALED / MYSTERY PACK</span>
          <span>{edition.id}</span>
        </div>
      </div>
      <div className={seal} />
    </div>
  );
}

/** PackArt's natural width; everything inside it is sized in px against this. */
const PACK_WIDTH = 228;

/**
 * The real pack art shrunk to a fixed width (shelf rows, list thumbnails).
 * Scaled as a whole, so it looks exactly like the carousel pack.
 */
export function MiniPackArt({ edition, width = 40, className = "" }: { edition: Edition; width?: number; className?: string }) {
  const scale = width / PACK_WIDTH;
  return (
    <span className={cn("relative block shrink-0 overflow-hidden rounded-[3px]", className)} style={{ width, height: Math.round(width * 1.6) }} aria-hidden="true">
      <span className="block" style={{ width: PACK_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <PackArt edition={edition} />
      </span>
    </span>
  );
}

/** Scale that makes PackArt span `fill` of the returned ref's width. */
function usePackScale(fill: number) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale((el.clientWidth * fill) / PACK_WIDTH);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fill]);
  return [frame, scale] as const;
}

/** PackArt filling its container's width, a little taller than a 2:3 stock card. */
export function FitPackArt({ edition, className = "" }: { edition: Edition; className?: string }) {
  const [frame, scale] = usePackScale(1);
  return (
    <div ref={frame} className={cn("aspect-[2/3.2] overflow-hidden rounded-[4px]", className)}>
      <div style={{ width: PACK_WIDTH, height: PACK_WIDTH * 1.6, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <PackArt edition={edition} className="h-full justify-between" />
      </div>
    </div>
  );
}

/**
 * A sealed pack of one risk tier (drawn in that tier's design and numbered), scaled as a whole to `fill` of its container's width so it keeps
 * PackArt's proportions at any size: market tiles, the sell panel, dialogs.
 */
export function TierPackArt({ tier, id, fill = 0.78, className = "" }: { tier: number; id: bigint; fill?: number; className?: string }) {
  const [frame, scale] = usePackScale(fill);
  const t = PACK_TIERS[tier];
  const edition: Edition = { ...editionForTier(tier), id: `#${String(id)}`, name: t?.name ?? "Mystery", subtitle: t?.risk ?? "" };
  return (
    <div ref={frame} className={cn("grid place-items-center overflow-hidden", className)} role="img" aria-label={`${edition.name} pack ${edition.id}, sealed`}>
      <div style={{ width: PACK_WIDTH, transform: `scale(${scale}) rotate(-5deg)` }} aria-hidden="true">
        <PackArt edition={edition} />
      </div>
    </div>
  );
}
