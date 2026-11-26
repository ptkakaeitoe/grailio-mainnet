import type { ReactNode } from "react";
import { cn } from "@/components/clean-ui";

const face = "absolute inset-0 overflow-hidden rounded-[4px] shadow-[0_10px_24px_-14px_rgba(0,0,0,.45)] [backface-visibility:hidden]";

/**
 * A card that turns over on hover, focus or tap: art on the front, details on
 * the back. Only the art flips, so hovering actions below it doesn't.
 */
export function FlipCard({ flipped, onToggle, label, front, back }: { flipped: boolean; onToggle: () => void; label: string; front: ReactNode; back: ReactNode }) {
  return (
    <div className="group/flip [perspective:1200px]">
      <button
        type="button"
        aria-pressed={flipped}
        aria-label={label}
        onClick={onToggle}
        className={cn("relative block aspect-[1024/1536] w-full rounded-[4px] [transform-style:preserve-3d] transition-transform duration-700 ease-[cubic-bezier(.2,.8,.3,1)] group-hover/flip:[transform:rotateY(180deg)] focus-visible:[transform:rotateY(180deg)] focus-visible:outline-offset-[6px]", flipped ? "[transform:rotateY(180deg)]" : "")}
      >
        <span className={face}>{front}</span>
        <span className={cn(face, "flex flex-col border border-border bg-white px-4 pt-[17px] pb-3.5 text-left text-black [transform:rotateY(180deg)] before:pointer-events-none before:absolute before:inset-[5px] before:rounded-[2px] before:border before:border-border")}>
          {back}
        </span>
      </button>
    </div>
  );
}

/** Pieces for a card back: header row, title, detail rows, footer. */
export const cardBack = {
  row: "relative flex justify-between gap-2 text-[9px] tracking-[0.1em] text-muted",
  title: "relative my-3 flex flex-col gap-px",
  name: "text-2xl leading-tight font-normal tracking-[-0.01em]",
  sub: "text-[10px] tracking-[0.1em] text-muted",
  meta: "relative mb-auto flex flex-col gap-1.5",
  item: "flex items-baseline justify-between gap-2 border-b border-dotted border-border-strong pb-1",
  dt: "text-[9px] tracking-[0.07em] text-muted uppercase",
  dd: "m-0 text-xs font-medium tabular-nums",
  foot: "relative mt-2 flex justify-center text-[9px] tracking-[0.1em] text-muted",
};
