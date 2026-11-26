"use client";

import { XIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef } from "react";

import { cleanButton, cleanDialog, cn, dialogClose, dialogFooter, dialogHeader, dialogLabel } from "@/components/clean-ui";
import { StockCardFront } from "@/components/stock-card-front";
import type { StockCard } from "@/lib/cards";
import { RARITY_NAMES } from "@/lib/contracts";

/**
 * Confirm a marketplace purchase: the card, what it holds and is worth now,
 * the price, and your balance before and after. Nothing is bought until
 * "Confirm purchase".
 */
export function BuyConfirmDialog({ art, rarity, inside, worth, price, priceUsd, balance, after, seller, insufficient, busy, error, onConfirm, onClose }: {
  art: StockCard;
  rarity: number;
  /** e.g. "0.0019 MSFT" */
  inside: string;
  /** Value of what's inside now, e.g. "$0.81". */
  worth: string;
  /** In the listing's currency, e.g. "0.1235 BNB". */
  price: string;
  /** "≈ $0.83" for BNB prices. */
  priceUsd?: string;
  /** Your balance of the listing's currency, e.g. "100 BNB". */
  balance: string | null;
  /** Balance after buying. */
  after: string | null;
  seller: string;
  insufficient: boolean;
  busy?: string | null;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const row = "flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-sm";
  return (
    <dialog
      ref={dialog}
      className={cn(cleanDialog, "w-[min(420px,calc(100%-32px))]")}
      aria-labelledby="buy-title"
      onCancel={onClose}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <header className={dialogHeader}>
        <span className={dialogLabel}>[ confirm purchase ]</span>
        <button type="button" className={dialogClose} aria-label="Close" disabled={Boolean(busy)} onClick={onClose}><XIcon className="size-[18px]" /></button>
      </header>
      <div className="p-5">
        <div className="flex items-center gap-4">
          <StockCardFront art={art} decorative sizes="88px" className="w-[88px] shrink-0" rarity={rarity} />
          <div className="min-w-0">
            <h2 id="buy-title" className="text-xl font-normal">{art.name}</h2>
            <p className="mt-0.5 text-sm text-muted">{RARITY_NAMES[rarity]} · {art.ticker}</p>
            <p className="mt-3 text-[26px] leading-none tracking-[-0.02em] tabular-nums">{price}</p>
            {priceUsd && <p className="mt-1 text-sm text-muted tabular-nums">{priceUsd}</p>}
          </div>
        </div>
        <dl className="mt-5 border-t border-border">
          <div className={row}><dt className="text-muted">Inside</dt><dd className="tabular-nums">{inside}</dd></div>
          <div className={row}><dt className="text-muted">Worth now</dt><dd className="tabular-nums">{worth}</dd></div>
          <div className={row}><dt className="text-muted">Seller</dt><dd>{seller}</dd></div>
          {balance !== null && <div className={row}><dt className="text-muted">Your balance</dt><dd className="tabular-nums">{balance}</dd></div>}
          {after !== null && !insufficient && <div className={row}><dt className="text-muted">After buying</dt><dd className="tabular-nums">{after}</dd></div>}
        </dl>
        {error && <p className="mt-3 text-sm break-words text-down" role="alert">{error}</p>}
      </div>
      <div className={cn(dialogFooter, "flex flex-col gap-3")}>
        <button type="button" className={cn(cleanButton.solid, "h-11 w-full justify-center")} disabled={insufficient || Boolean(busy)} onClick={onConfirm}>
          {busy ?? (insufficient ? "Not enough balance" : `Confirm purchase · ${price}`)}
        </button>
        <button type="button" className="w-full text-center text-sm text-muted underline-offset-4 hover:text-black hover:underline" disabled={Boolean(busy)} onClick={onClose}>Cancel</button>
      </div>
    </dialog>
  );
}
