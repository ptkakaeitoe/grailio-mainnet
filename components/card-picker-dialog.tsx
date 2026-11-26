"use client";

import { cardArt } from "@/lib/cards";
import { CheckIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef } from "react";
import { cleanDialog, cn, dialogClose, dialogHeader, dialogLabel } from "@/components/clean-ui";
import { StockCardFront } from "@/components/stock-card-front";
import { RARITY_NAMES } from "@/lib/contracts";
import { tokenAmount } from "@/lib/format-amount";
import { TOKENS } from "@/lib/tokens";
import type { CardInfo } from "@/lib/use-collect-market";

const usd = (n: number | null) => (n === null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/**
 * Pick one of your cards to sell. Every card you own is shown; staked or
 * already-listed ones are greyed out with the reason.
 */
export function CardPickerDialog({ cards, listedIds, selectedId, worth, onSelect, onClose }: {
  cards: CardInfo[];
  /** Ids (as strings) of cards that are already listed. */
  listedIds: Set<string>;
  selectedId: string | null;
  /** What a card holds now, in USD. */
  worth: (card: CardInfo) => number | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const blocked = (c: CardInfo) => (c.staked ? "Staked" : listedIds.has(c.id.toString()) ? "Listed" : null);
  // Sellable cards first.
  const sorted = [...cards].sort((a, b) => Number(Boolean(blocked(a))) - Number(Boolean(blocked(b))));

  return (
    <dialog
      ref={dialog}
      className={cn(cleanDialog, "w-[min(560px,calc(100%-32px))]")}
      aria-labelledby="card-picker-title"
      onCancel={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <header className={dialogHeader}>
        <span className={dialogLabel}>[ sell a card ]</span>
        <button type="button" className={dialogClose} aria-label="Close" onClick={onClose}><XIcon className="size-[18px]" /></button>
      </header>
      <div className="p-5">
        <h2 id="card-picker-title" className="text-xl font-normal">Choose a card</h2>
        {cards.length === 0 ? (
          <p className="mt-4 text-sm text-muted">You don&apos;t have any cards yet. Open a pack first.</p>
        ) : (
          <ul className="mt-4 grid max-h-[min(60vh,520px)] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3" role="listbox" aria-label="Your cards">
            {sorted.map((c) => {
              const art = cardArt(c.ticker, c.rarity, c.tier);
              if (!art) return null;
              const id = c.id.toString();
              const reason = blocked(c);
              const picked = id === selectedId;
              return (
                <li key={id} role="option" aria-selected={picked} aria-disabled={Boolean(reason)}>
                  <button
                    type="button"
                    disabled={Boolean(reason)}
                    onClick={() => { onSelect(id); onClose(); }}
                    className={cn(
                      "relative flex w-full flex-col gap-2 rounded-md border p-2 text-left transition-colors",
                      picked ? "border-black" : "border-border hover:border-black",
                      reason && "cursor-not-allowed opacity-45 hover:border-border",
                    )}
                  >
                    <StockCardFront art={art} decorative sizes="160px" className="w-full" rarity={c.rarity} />
                    <span className="min-w-0 px-0.5">
                      <span className="block truncate text-sm">#{id} · {RARITY_NAMES[c.rarity]}</span>
                      <span className="block truncate text-[13px] text-muted tabular-nums">
                        {c.filled ? `${tokenAmount(c.amount)} ${TOKENS[c.ticker]?.symbol ?? c.ticker}` : "USDC (unfilled)"} · {usd(worth(c))}
                      </span>
                      {reason && <span className="block text-[13px] text-muted">{reason === "Staked" ? "Staked: unstake to sell" : "Already listed"}</span>}
                    </span>
                    {picked && <span className="absolute top-3 right-3 grid size-6 place-items-center rounded-full bg-black text-white"><CheckIcon className="size-3.5" /></span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </dialog>
  );
}
