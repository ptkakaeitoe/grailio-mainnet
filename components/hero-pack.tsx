import { FitPackArt } from "@/components/pack-art";
import { EDITIONS } from "@/lib/editions";

/**
 * The first pack (Fable) in the landing hero, held between the two hands (HeroHands). A gold starburst shines from behind it, and it tilts back a little on hover
 * (.hero-card-tilt in globals.css). The caller sizes it (a height or a width; it keeps the pack's 5:8 shape) and places it.
 */
export function HeroPack({ className }: { className?: string }) {
  return (
    <figure className={`isolate m-0 aspect-[5/8] min-w-0 ${className ?? ""}`} aria-hidden="true">
      {/* A gold lens-flare starburst behind the pack: short soft rays and long thin streaks, slowly turning (globals.css). */}
      <div className="hero-pack-rays hero-pack-rays--soft pointer-events-none absolute top-1/2 left-1/2 -z-20 aspect-square w-[300%] -translate-x-1/2 -translate-y-1/2" />
      <div className="hero-pack-rays pointer-events-none absolute top-1/2 left-1/2 -z-20 aspect-square w-[380%] -translate-x-1/2 -translate-y-1/2" />
      <div className="hero-card-tilt size-full shadow-[0_24px_48px_-20px_rgb(0_0_0/.7)]">
        <FitPackArt edition={EDITIONS[0]} className="w-full" />
      </div>
    </figure>
  );
}
