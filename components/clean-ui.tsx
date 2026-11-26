import type { CSSProperties, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/** Joins class strings; on conflicts (e.g. text-base vs text-sm) the later class wins. */
export const cn = (...classes: (string | false | null | undefined)[]) =>
  twMerge(classes.filter(Boolean).join(" "));

/** Shared Tailwind classes for the clean theme (landing, packs, profile). */
export const cleanButton = {
  /** Bright fill that stays put on hover; only its ↗ arrow nudges (globals.css). */
  solid:
    "inline-flex min-h-12 items-center gap-3 rounded-md border-[1.5px] border-black bg-black px-4 text-base text-white disabled:cursor-not-allowed disabled:opacity-40",
  /** Muted outline over a translucent dark backing (70% + blur) that turns bright on hover. */
  outline:
    "inline-flex min-h-12 items-center gap-3 rounded-md border-[1.5px] border-border-strong bg-white/70 backdrop-blur-[6px] px-4 text-base text-black transition-colors not-disabled:hover:border-black disabled:cursor-not-allowed disabled:opacity-40",
  /** Compact outline for secondary actions. */
  small:
    "inline-flex min-h-10 items-center gap-2 rounded-md border-[1.5px] border-border-strong bg-white/70 backdrop-blur-[6px] px-3.5 text-sm text-black transition-colors not-disabled:hover:border-black",
};

/** Page gutters: 18px on phones, 24px, 32px from 801px, 64px from 1201px. */
export const gutter = "px-[18px] phone:px-6 desk:px-8 wide:px-16";

/** Width-capped, gutter-padded page column. */
export const pageColumn = `mx-auto w-full max-w-[1600px] ${gutter}`;

/** Text link with the nav's fade-in underline; stays underlined for the current page. */
export const cleanLink =
  "relative inline-flex items-center gap-1.5 whitespace-nowrap py-1 text-base tracking-[0.01em] text-black after:absolute after:inset-x-0 after:bottom-0 after:h-[1.5px] after:bg-current after:opacity-0 after:transition-opacity after:duration-250 hover:after:opacity-100 focus-visible:after:opacity-100 aria-[current=page]:after:opacity-100";

/** Rarity dot colors: common, rare, epic, legendary. */
export const RARITY_DOT = ["#8a9183", "#779bad", "#9883aa", "#b29451"];

/** Native <dialog> frame: centred, scrollable, see-through like the nav (white 72% + blur) over a light dim. Add a width like `w-[min(480px,calc(100%-32px))]`. */
/** A see-through panel that slides in from the left edge, floating 8px off it (`.side-drawer` in globals.css). Add a width. */
export const cleanDrawerLeft =
  "side-drawer fixed top-[max(.5rem,env(safe-area-inset-top))] bottom-[max(.5rem,env(safe-area-inset-bottom))] right-auto left-2 m-0 h-[calc(100dvh-max(.5rem,env(safe-area-inset-top))-max(.5rem,env(safe-area-inset-bottom)))] max-h-none max-w-none overflow-y-auto overscroll-contain rounded-lg border border-border-strong bg-white/72 p-0 text-black shadow-[12px_0_40px_-24px_rgba(0,0,0,.25)] backdrop-blur-[14px] open:flex open:flex-col [&>*]:shrink-0";
/** A see-through panel that slides in from the right edge, floating 8px off it (`.side-drawer` in globals.css). Add a width. */
export const cleanDrawerRight =
  "side-drawer side-drawer--right fixed top-[max(.5rem,env(safe-area-inset-top))] bottom-[max(.5rem,env(safe-area-inset-bottom))] right-2 left-auto m-0 h-[calc(100dvh-max(.5rem,env(safe-area-inset-top))-max(.5rem,env(safe-area-inset-bottom)))] max-h-none max-w-none overflow-y-auto overscroll-contain rounded-lg border border-border-strong bg-white/72 p-0 text-black shadow-[-12px_0_40px_-24px_rgba(0,0,0,.25)] backdrop-blur-[14px] open:flex open:flex-col [&>*]:shrink-0";

export const cleanDialog =
  "pop-dialog fixed inset-0 m-auto max-h-[calc(100dvh-32px)] overflow-y-auto overscroll-contain rounded-md border border-border-strong bg-white/72 p-0 text-black shadow-[0_24px_64px_-24px_rgba(0,0,0,.35)] backdrop-blur-[14px] backdrop:bg-[rgb(0_0_0/.5)] open:flex open:flex-col [&>*]:shrink-0 motion-reduce:[&_*]:!animate-none";

/**
 * A dialog's or drawer's buttons, pinned to its bottom edge like the header is to the top: the content between them
 * scrolls. Use it as a direct child of the dialog (the dialogs are flex columns, so in a drawer it sits at the
 * bottom even when the content is short). Add the layout, e.g. `flex flex-col gap-2`.
 */
export const dialogFooter =
  "sticky bottom-0 z-10 mt-auto border-t border-border bg-white px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] empty:hidden phone:px-6";

/** A dialog's title bar, pinned to the top while the content scrolls (pairs with dialogFooter). */
export const dialogHeader = "sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-white px-5 py-3";

/** Square close button for dialogs. */
export const dialogClose =
  "grid size-10 shrink-0 place-items-center rounded-md text-2xl transition-colors hover:bg-surface-muted";

/** Bracketed dialog label, e.g. "[ redeem / card #4 ]". */
export const dialogLabel = "text-sm text-muted";

/** Layout for the pack reveal and redeem dialogs. */
export const revealUi = {
  content: "relative p-6 text-center phone:p-8",
  close: "absolute top-2 right-3 grid size-10 place-items-center text-[28px]",
  stage: "relative isolate mt-3 mb-6 grid h-[300px] place-items-center",
  heading: "text-[30px] leading-[1.15] font-light tracking-[-0.02em]",
  body: "mt-3 mb-6 text-sm text-muted",
  actions: "flex flex-col items-center justify-center gap-5",
  count:
    "absolute top-20 left-[calc(50%+108px)] z-[2] text-4xl leading-none tracking-[-0.02em]",
  card: "h-[285px] w-[190px] animate-[card-unveil_.65s_ease-out_both] object-contain drop-shadow-[0_12px_12px_#00000033]",
};

/** Section opener: a thin rule, the bracketed label on the left, a two-tone title in the right column. */
export function SectionHeading({
  label,
  title,
  subtitle,
  children,
}: {
  label: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-10 grid grid-cols-1 items-start gap-4 border-t border-border pt-6 desk:mb-16 desk:grid-cols-2 desk:gap-8">
      <p className="text-sm text-black">[ {label} ]</p>
      <div>
        <h2 className="text-[clamp(36px,3.8vw,48px)] leading-[1.15] font-light tracking-[-0.02em]">
          {title}
          {subtitle && (
            <>
              <br />
              <span className="text-muted-soft">{subtitle}</span>
            </>
          )}
        </h2>
        {children}
      </div>
    </div>
  );
}

/** Form controls: text inputs and selects. */
export const cleanField =
  "h-11 w-full rounded-md border border-border-strong bg-white px-3 text-base transition-colors focus:border-black focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

/** Toggle chip for filters; pressed state inverts. */
export const cleanChip =
  "rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:border-border-strong aria-pressed:border-black aria-pressed:bg-black aria-pressed:text-white";

/** Bordered side panel. */
export const cleanPanel = "rounded-md border border-border p-6";

/** Muted note under a page's content (disclaimers, fees). */
export const pageNote =
  "trade-footer mt-4 border-t border-border pt-6 text-sm text-muted"; // trade-footer: /v2 hook

/** Page opener: the bracketed label left, a large two-tone title and short intro in the right column. */
export function PageHeading({
  label,
  title,
  subtitle,
  intro,
  children,
}: {
  label: string;
  title: ReactNode;
  subtitle?: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  return (
    // trade-heading: /v2 hides page headings by this hook.
    <header className="trade-heading grid grid-cols-1 items-start gap-4 pt-6 pb-10 desk:grid-cols-2 desk:gap-8 desk:pt-10 desk:pb-16">
      <p className="text-sm text-black">[ {label} ]</p>
      <div>
        <h1 className="text-[clamp(40px,5vw,64px)] leading-[1.08] font-light tracking-[-0.02em]">
          {title}
          {subtitle && (
            <>
              <br />
              <span className="text-muted-soft">{subtitle}</span>
            </>
          )}
        </h1>
        {intro && (
          <p className="mt-5 max-w-[440px] text-base leading-normal text-muted">
            {intro}
          </p>
        )}
        {children}
      </div>
    </header>
  );
}

/** A row of hairline-separated figures (market floors, treasury stats). */
export function StatStrip({
  items,
  className = "",
}: {
  items: { label: ReactNode; value: ReactNode; note?: ReactNode }[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px border-y border-border bg-border desk:grid-cols-[repeat(var(--n),minmax(0,1fr))] max-desk:[&>div:last-child:nth-child(odd)]:col-span-2",
        className,
      )}
      style={{ "--n": items.length } as CSSProperties}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className="bg-white py-5 pr-4 odd:pl-0 even:pl-4 desk:pl-4 desk:first:pl-0"
        >
          <dt className="text-sm text-muted">{item.label}</dt>
          <dd className="mt-1.5 text-2xl tracking-[-0.02em] tabular-nums max-phone:text-lg">
            {item.value}
          </dd>
          {item.note && (
            <dd className="mt-1 text-[13px] text-muted">{item.note}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
