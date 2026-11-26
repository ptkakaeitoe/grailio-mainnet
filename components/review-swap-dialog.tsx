"use client";

import { ArrowDownIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef } from "react";

import { cleanButton, cleanDialog, cn, dialogClose, dialogFooter, dialogHeader, dialogLabel } from "@/components/clean-ui";
import { TokenIcon } from "@/components/token-icon";

/**
 * Grailio's own confirmation before a live swap is signed (the wallet's pop-up
 * is hidden for wallets Privy makes). Shows what you pay and get, the minimum
 * after slippage, the fee and the route; if the token needs a one-time
 * permission for KyberSwap's router, that step comes first.
 */
export function ReviewSwapDialog({ from, to, pay, payUsd, receive, receiveUsd, minReceive, slippage, gasUsd, collectFee, needsApproval, approving, busy, error, onApprove, onConfirm, onClose }: {
  from: string;
  to: string;
  pay: string;
  payUsd: string | null;
  receive: string;
  receiveUsd: string | null;
  minReceive: string;
  slippage: string;
  gasUsd: string | null;
  /** Grailio's swap fee, e.g. "0.5% · half to stakers" (already taken out of "receive"). */
  collectFee?: string;
  needsApproval: boolean;
  approving: boolean;
  busy: boolean;
  error: string | null;
  onApprove: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const row = "flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-sm";
  const side = (label: string, symbol: string, amount: string, usd: string | null) => (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="truncate text-2xl tracking-[-0.01em] tabular-nums">{amount}</p>
        {usd && <p className="text-sm text-muted tabular-nums">{usd}</p>}
      </div>
      <span className="inline-flex shrink-0 items-center gap-2 text-base"><TokenIcon symbol={symbol} className="size-7" />{symbol}</span>
    </div>
  );
  return (
    <dialog
      ref={dialog}
      className={cn(cleanDialog, "w-[min(420px,calc(100%-32px))]")}
      aria-labelledby="review-swap-title"
      onCancel={(e) => { if (busy || approving) e.preventDefault(); else onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy && !approving) onClose(); }}
    >
      <header className={dialogHeader}>
        <h2 id="review-swap-title" className={dialogLabel}>[ review swap ]</h2>
        <button type="button" className={dialogClose} aria-label="Close" disabled={busy || approving} onClick={onClose}><XIcon className="size-[18px]" /></button>
      </header>
      <div className="flex flex-col gap-2 p-5">
        {side("You pay", from, pay, payUsd)}
        <span className="mx-auto grid size-8 place-items-center rounded-full border border-border" aria-hidden="true"><ArrowDownIcon weight="bold" size={16} /></span>
        {side("You receive (estimated)", to, receive, receiveUsd)}
        <dl className="mt-3 border-t border-border">
          <div className={row}><dt className="text-muted">Minimum received</dt><dd className="tabular-nums">{minReceive} {to}</dd></div>
          <div className={row}><dt className="text-muted">Slippage</dt><dd className="tabular-nums">{slippage}%</dd></div>
          {collectFee && <div className={row}><dt className="text-muted">Grailio fee</dt><dd className="tabular-nums">{collectFee}</dd></div>}
          {gasUsd && <div className={row}><dt className="text-muted">Network fee</dt><dd className="tabular-nums">≈ {gasUsd}</dd></div>}
          <div className={row}><dt className="text-muted">Route</dt><dd>KyberSwap · BNB Chain</dd></div>
        </dl>
        {needsApproval && (
          <p className="mt-2 text-sm text-muted">First, allow KyberSwap&apos;s router to use your {from}. You do this once per token.</p>
        )}
        {error && <p className="mt-2 text-sm break-words text-down" role="alert">{error}</p>}
      </div>
      <div className={cn(dialogFooter, "flex flex-col gap-3")}>
        {needsApproval ? (
          <button type="button" className={cn(cleanButton.solid, "h-11 w-full justify-center")} disabled={approving} onClick={onApprove}>
            {approving ? "Approving…" : `Approve ${from}`}
          </button>
        ) : (
          <button type="button" className={cn(cleanButton.solid, "h-11 w-full justify-center")} disabled={busy} onClick={onConfirm}>
            {busy ? "Swapping…" : "Confirm swap"}
          </button>
        )}
        <button type="button" className="w-full text-center text-sm text-muted underline-offset-4 hover:text-black hover:underline disabled:opacity-40" disabled={busy || approving} onClick={onClose}>Cancel</button>
      </div>
    </dialog>
  );
}
