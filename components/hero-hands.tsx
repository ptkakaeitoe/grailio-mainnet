import Image from "next/image";

import { cn } from "@/components/clean-ui";
import { HeroPack } from "@/components/hero-pack";

/**
 * The hero artwork (1536×1024, transparent background with soft edges), so the hands keep their true colours over the
 * glow. Every piece shares one URL and `sizes`, so it downloads once.
 */
const ART = { src: "/art/hero/creation-hands.webp", w: 1536, h: 1024, sizes: "(max-width: 800px) 100vw, 1600px" };

/** The two hands, cut from the artwork in its pixels; the painted coin between them is left out (the pack replaces it). */
const CROPS = {
  left: { x: 0, y: 430, w: 714, h: 594 },
  right: { x: 818, y: 0, w: 718, h: 600 },
} as const;

type Crop = (typeof CROPS)[keyof typeof CROPS];

/** One piece of the artwork: a box in the crop's shape showing just that part of the image. */
function ArtPiece({ crop, className, preload = false }: { crop: Crop; className?: string; preload?: boolean }) {
  return (
    <div className={cn("absolute overflow-hidden", className)} style={{ aspectRatio: `${crop.w} / ${crop.h}` }}>
      <Image
        src={ART.src}
        alt=""
        width={ART.w}
        height={ART.h}
        preload={preload}
        quality={90}
        sizes={ART.sizes}
        className="absolute h-auto max-w-none"
        style={{ width: `${(ART.w / crop.w) * 100}%`, left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%` }}
      />
    </div>
  );
}

/**
 * Desktop: the two hands pulled apart into the hero's corners, reaching in from the screen edges, with the pack
 * between them. They're the hero's backdrop: the headline and buttons sit on top. Each hand is 54% of the hero's
 * height, keeping the left fingertip clear of the buttons; the pack goes at 48.7%, between the fingertips. The left forearm dissolves gradually toward the bottom; the inner cut
 * edges fade over 2% so the fingertip glow never ends in a line. The hands float (globals.css); the pack tilts on hover (HeroPack).
 */
export function HeroHands() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-y-0 right-[calc(50%-50vw)] left-[calc(50%-50vw)] -z-10 hidden overflow-hidden select-none desk:block"
        aria-hidden="true"
      >
        <ArtPiece crop={CROPS.left} className="hand-float-left bottom-0 left-0 h-[54%] [mask-composite:intersect] mask-[linear-gradient(to_bottom,#000_45%,rgb(0_0_0/.55)_72%,rgb(0_0_0/.18)_88%,transparent),linear-gradient(to_left,transparent,#000_2%)]" />
        <ArtPiece crop={CROPS.right} className="hand-float-right top-0 right-0 h-[54%] mask-[linear-gradient(to_right,transparent,#000_2%)]" />
      </div>
      <HeroPack className="absolute top-[48.7%] left-1/2 hidden h-[50%] -translate-x-1/2 -translate-y-1/2 desk:block" />
    </>
  );
}

/**
 * Phones: the artwork's own layout, the hands nudged apart to make room for the pack, running edge to edge past the
 * page gutters. The mask fades the edges so the forearms dissolve.
 */
export function HeroHandsPhone({ className }: { className?: string }) {
  return (
    <div className={cn("relative -mx-[18px] aspect-[3/2] w-[calc(100%+36px)] select-none phone:-mx-6 phone:w-[calc(100%+48px)] desk:hidden", className)}>
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,#000_7%,#000_93%,transparent),linear-gradient(to_bottom,#000_55%,rgb(0_0_0/.4)_80%,transparent)]"
        aria-hidden="true"
      >
        <ArtPiece crop={CROPS.left} preload className="hand-float-left top-[42%] left-[-18%] w-[46.5%]" />
        <ArtPiece crop={CROPS.right} className="hand-float-right top-0 left-[71.3%] w-[46.7%]" />
      </div>
      <HeroPack className="absolute top-[49.4%] left-1/2 h-[75%] -translate-x-1/2 -translate-y-1/2" />
    </div>
  );
}
