"use client";

import { XIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef } from "react";

import { cleanButton, cleanDialog, cn, dialogClose, dialogFooter, dialogHeader, dialogLabel } from "@/components/clean-ui";
import { MiniPackArt } from "@/components/pack-art";
import type { Edition } from "@/lib/editions";

/**
 * Confirm a pack purchase: which pack and how many, the total, your balance
 * before and after, and the points you earn. Nothing is bought until Confirm.
 */
export function PackConfirmDialog({ edition, name, risk, quantity, total, balance, after, points, gift, onGiftChange, needsApproval = false, approving = false, onApprove, swap, onConfirm, onClose }: {
  edition: Edition;
  name: string;
  /** e.g. "Medium risk" */
  risk: string;
  quantity: number;
  /** e.g. "3 USDT" */
  total: string;
  balance: string | null;
  after: string | null;
  points: number;
  /** Bought as a gift: you get a code to send instead of the packs. */
  gift: boolean;
  /** Shows the "Buy as a gift" checkbox. */
  onGiftChange?: (gift: boolean) => void;
  /** Mainnet: USDT must first be allowed for the pack contract (once). */
  needsApproval?: boolean;
  approving?: boolean;
  onApprove?: () => void;
  /** Paying with BNB: swap it for the missing USDT first. */
  swap?: { bnb: string; swapping: boolean; ready: boolean; onSwap: () => void };
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const row = "flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-sm";
  const packs = quantity === 1 ? `${name} pack` : `${quantity} ${name} packs`;
  return (
    <dialog
      ref={dialog}
      className={cn(cleanDialog, "w-[min(400px,calc(100%-32px))]")}
      aria-labelledby="pack-confirm-title"
      onCancel={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <header className={dialogHeader}>
        <span className={dialogLabel}>[ confirm {gift ? "gift" : "purchase"} ]</span>
        <button type="button" className={dialogClose} aria-label="Close" onClick={onClose}><XIcon className="size-[18px]" /></button>
      </header>
      <div className="p-5">
        <div className="flex items-center gap-4">
          <MiniPackArt edition={edition} width={56} />
          <div className="min-w-0">
            <h2 id="pack-confirm-title" className="text-xl font-normal">{packs}</h2>
            <p className="mt-0.5 text-sm text-muted">{risk}</p>
            <p className="mt-3 text-[26px] leading-none tracking-[-0.02em] tabular-nums">{total}</p>
          </div>
        </div>
        <dl className="mt-5 border-t border-border">
          {balance !== null && <div className={row}><dt className="text-muted">Your balance</dt><dd className="tabular-nums">{balance}</dd></div>}
          {after !== null && <div className={row}><dt className="text-muted">After buying</dt><dd className="tabular-nums">{after}</dd></div>}
          <div className={row}><dt className="text-muted">Points earned</dt><dd className="tabular-nums">+{points}</dd></div>
        </dl>
        {onGiftChange && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" className="mt-[3px] size-4 shrink-0 accent-black" checked={gift} onChange={(e) => onGiftChange(e.target.checked)} />
            <span className="min-w-0">
              <span className="block text-base leading-snug">Buy as a gift</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted">Get a code to send instead of the packs.</span>
            </span>
          </label>
        )}
        {swap && <p className="mt-4 text-sm text-muted">Step 1: swap {swap.bnb} for USDT.</p>}
        {!swap && needsApproval && <p className="mt-4 text-sm text-muted">First, allow Grailio&apos;s pack contract to use your USDT. You do this once.</p>}
      </div>
      <div className={cn(dialogFooter, "grid grid-cols-2 gap-2")}>
        <button type="button" className={cn(cleanButton.outline, "h-11 justify-center")} onClick={onClose}>Cancel</button>
        {swap ? (
          <button type="button" className={cn(cleanButton.solid, "h-11 justify-center")} disabled={swap.swapping || !swap.ready} onClick={swap.onSwap}>
            {swap.swapping ? "Swapping BNB…" : swap.ready ? "Swap BNB" : "Getting quote…"}
          </button>
        ) : needsApproval ? (
          <button type="button" className={cn(cleanButton.solid, "h-11 justify-center")} disabled={approving} onClick={onApprove}>
            {approving ? "Approving…" : "Approve USDT"}
          </button>
        ) : (
          <button type="button" className={cn(cleanButton.solid, "h-11 justify-center")} onClick={onConfirm}>
            {gift ? "Confirm gift" : "Confirm"}
          </button>
        )}
      </div>
    </dialog>
  );
}
