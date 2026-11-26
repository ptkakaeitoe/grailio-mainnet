"use client";

import { cardArt } from "@/lib/cards";
import { ArrowRightIcon, ArrowUpRightIcon, XIcon } from "@phosphor-icons/react/ssr";
import { StockCardFront } from "@/components/stock-card-front";
import { cleanButton, cleanDialog, cleanLink, cn, dialogFooter, dialogLabel, revealUi } from "@/components/clean-ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWaitForTransactionReceipt } from "wagmi";
import { useToastedWrite } from "@/lib/toast";

import { collectPacksAbi, collectPacksAddress } from "@/lib/collect-packs";
import { TOKENS } from "@/lib/tokens";
import { txErrorMessage } from "@/lib/tx-error";
import type { StockCardView } from "@/lib/use-stock-cards";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

/**
 * Redeem = burn the card, receive the tokens inside (or its USDT if the card
 * was never filled). A confirm step first
 * (it can't be undone), then the result, in the pack-reveal dialog style.
 */
export function RedeemDialog({
  card,
  value,
  onClose,
  onRedeemed,
  demoRedeem,
}: {
  card: StockCardView;
  /** Current USD value of the backing. */
  value: number;
  onClose: () => void;
  onRedeemed: () => void;
  /** Demo mode: redeem in the simulation instead of on-chain; false if refused. */
  demoRedeem?: () => boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const art = cardArt(card.ticker, card.rarity, card.tier);
  const [demoDone, setDemoDone] = useState(false);
  const [demoError, setDemoError] = useState("");
  const { writeContract, data: hash, isPending, error, reset } = useToastedWrite();
  const receipt = useWaitForTransactionReceipt({ hash });
  const phase = receipt.isSuccess || demoDone ? "done" : isPending ? "wallet" : hash ? "burning" : "confirm";
  // What the card pays out: its tokens, or its USDT if it was never filled.
  const payout = card.filled ? { amount: fmt(card.amount), symbol: TOKENS[card.ticker]?.symbol ?? card.ticker } : { amount: fmt(card.usd), symbol: "USDT" };
  const stock = `${payout.amount} ${payout.symbol}`;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (receipt.isSuccess) onRedeemed();
    // Only react to a newly confirmed redeem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  // Closing mid-transaction would hide the outcome; keep it open until settled.
  const closable = phase === "confirm" || phase === "done" || Boolean(error);

  return (
    <dialog
      ref={dialog}
      className={cn(cleanDialog, "w-[min(480px,calc(100%-32px))]")}
      aria-labelledby="redeem-title"
      onCancel={(event) => { event.preventDefault(); if (closable) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget && closable) onClose(); }}
    >
      <div className={revealUi.content}>
        {closable && <button type="button" className={revealUi.close} onClick={onClose} aria-label="Close"><XIcon /></button>}
        <p className={dialogLabel}>[ redeem / card #{String(card.id)} ]</p>

        {/* Burning shakes the card; once done it greys out and the token takes over. */}
        <div className="mt-[26px] mb-[22px] flex items-center justify-center gap-[18px]" aria-hidden="true">
          {art && <StockCardFront art={art} rarity={card.rarity} decorative sizes="120px" className={cn("w-[120px] transition-[transform,opacity,filter] duration-500 motion-reduce:transition-none", phase === "burning" ? "animate-[pack-shake_.18s_ease-in-out_infinite_alternate]" : phase === "done" ? "scale-[.85] -rotate-6 opacity-25 grayscale" : "")} />}
          <span className="text-[22px] text-muted-soft"><ArrowRightIcon weight="bold" /></span>
          <span className={cn("flex flex-col items-start gap-0.5 rounded-md border px-[18px] py-4", phase === "done" ? "animate-[card-unveil_.5s_ease-out_both] border-black bg-accent-soft" : "border-border-strong bg-surface-muted")}>
            <strong className="text-[22px] font-normal tracking-[-0.02em] tabular-nums">{payout.amount}</strong>
            <span className="text-sm text-muted">{payout.symbol}</span>
            {value > 0 && <span className="text-sm text-muted tabular-nums">≈ ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
          </span>
        </div>

        <div role="status" aria-live="polite">
          <h2 id="redeem-title" className={revealUi.heading}>
            {phase === "done" ? "Redeemed." : phase === "wallet" ? "Confirm in your wallet." : phase === "burning" ? "Burning the card…" : "Burn this card?"}
          </h2>
          {phase === "done" && <p className={revealUi.body}>{`${stock} is in your ${demoRedeem ? "demo " : ""}wallet now.`}</p>}
        </div>

        {(error || demoError) && <p className="mb-4 text-sm break-words text-down" role="alert">{error ? txErrorMessage(error) : demoError}</p>}
      </div>
      <div className={cn(dialogFooter, "flex flex-col")}>
        {phase === "confirm" && (
          <div className={revealUi.actions}>
            <button
              type="button"
              className={cleanButton.solid}
              onClick={() => {
                if (demoRedeem) {
                  if (demoRedeem()) { setDemoDone(true); onRedeemed(); } else setDemoError("Unstake the card before redeeming it.");
                  return;
                }
                reset();
                writeContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "redeem", args: [card.id] });
              }}
            >
              Redeem for {stock} <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" />
            </button>
            <button type="button" className={cn(cleanLink, "text-sm text-muted")} onClick={onClose}>Keep the card</button>
          </div>
        )}
        {phase === "done" && (
          <div className={revealUi.actions}>
            <Link className={cleanButton.solid} href="/trade" onClick={onClose}>
              Trade your {card.ticker} <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" />
            </Link>
            <button type="button" className={cn(cleanLink, "text-sm text-muted")} onClick={onClose}>Back to collection</button>
          </div>
        )}
      </div>
    </dialog>
  );
}
