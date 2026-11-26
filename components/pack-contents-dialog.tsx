"use client";

import { cardArt } from "@/lib/cards";
import { TokenIcon } from "@/components/token-icon";
import { XIcon } from "@phosphor-icons/react/ssr";
import { StockCardFront } from "@/components/stock-card-front";
import { cleanDrawerRight, cn, dialogClose, RARITY_DOT } from "@/components/clean-ui";
import { useEffect, useRef, useState } from "react";

import { useCards } from "@/lib/use-cards";
import { PACK_TIERS, RARITY_NAMES } from "@/lib/contracts";
import { editionForTier } from "@/lib/editions";
import { usd } from "@/lib/use-stock-prices";

/**
 * "What's inside" for a pack, kept minimal: tier chips, the odds table and the
 * relics. Stock-backed mode shows the chosen tier's odds and backing; legacy
 * mode (demo, or before the card contracts exist) shows each relic's rarity.
 */
// Four rarity cards: two rows of two on phones, one row of four from tablet up.
const sectionTitle = "text-xl font-normal";
/** A section after the first, split by a hairline (like the profile editor). */
const group = "border-t border-border pt-6";
const riskButton = "h-11 flex-1 rounded-md border border-border text-sm transition-colors hover:border-border-strong aria-pressed:border-black";
const label = "text-base text-muted";

export function PackContentsDialog({
  onClose,
  stockBacked,
  initialTier = 0,
  onTierChange,
}: {
  onClose: () => void;
  stockBacked: boolean;
  initialTier?: number;
  /** Lets the pack panel keep its own tier picker in sync. */
  onTierChange?: (tier: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tierId, setTierId] = useState(initialTier);
  const tier = PACK_TIERS[tierId];
  // Only this pack's risks: Fable shows Low / Medium / High, not every pack's tiers.
  const edition = editionForTier(tierId);
  const options = edition.tiers ?? [edition.tier];
  // The cards a pack can hold: stocks in demo mode, BNB Chain tokens otherwise.
  const { cards } = useCards();

  useEffect(() => {
    const el = dialog.current;
    const previousOverflow = document.body.style.overflow;
    el?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      el?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Slide back out to the right, then unmount (matches the .side-drawer transition).
  function dismiss() {
    dialog.current?.close();
    window.setTimeout(onClose, 340);
  }

  return (
    <dialog
      ref={dialog}
      className={cn(cleanDrawerRight, "w-[min(420px,calc(100vw-16px))]")}
      aria-labelledby="pack-contents-title"
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const b = event.currentTarget.getBoundingClientRect();
        if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) dismiss();
      }}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-5 py-4 phone:px-6">
        <h2 id="pack-contents-title" className={label}>[ {stockBacked ? `${edition.name.toLowerCase()} pack` : "classic pack"} ]</h2>
        <button type="button" className={dialogClose} aria-label="Close pack contents" onClick={dismiss} autoFocus><XIcon className="size-[18px]" /></button>
      </header>

      <div className="flex flex-col gap-6 px-5 py-6">
        {stockBacked && options.length > 1 && (
          <div className="flex gap-1.5" role="group" aria-label="Risk">
            {options.map((id) => (
              <button type="button" key={id} aria-pressed={tierId === id} className={riskButton} onClick={() => { setTierId(id); onTierChange?.(id); }}>{PACK_TIERS[id].level}</button>
            ))}
          </div>
        )}

        {/* One row per rarity: its card art, the chance and (stock-backed) what's inside. */}
        <section aria-labelledby="pack-odds-title" className={cn(stockBacked && options.length > 1 && group)}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="pack-odds-title" className={sectionTitle}>{stockBacked ? "Odds" : "Cards"}</h3>
            {stockBacked && <span className={label}>[ inside ]</span>}
          </div>
          <ul className="mt-4 list-none p-0">
            {RARITY_NAMES.map((name, r) => (
              <li key={name} className="flex items-center gap-4 border-b border-border py-3 first:border-t">
                <StockCardFront art={cardArt("", r, tierId)} rarity={r} decorative className="w-12 shrink-0" sizes="48px" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-base"><span className="size-1.5 shrink-0 rounded-full" style={{ background: RARITY_DOT[r] }} aria-hidden="true" />{name}</span>
                  <span className="text-sm text-muted"><span className="tabular-nums">{tier.odds[r]}%</span> chance</span>
                </span>
                {stockBacked && <span className="shrink-0 text-base tabular-nums">{usd(tier.backing[r])}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="pack-coins-title" className={group}>
          <h3 id="pack-coins-title" className={sectionTitle}>Holds one of</h3>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {cards.map((card) => (
              <span key={card.ticker} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm"><TokenIcon symbol={card.ticker} className="size-4" />{card.ticker}</span>
            ))}
          </div>
        </section>
      </div>
    </dialog>
  );
}
