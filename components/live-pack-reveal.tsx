"use client";

import { cardArt } from "@/lib/cards";
import { ArrowUpRightIcon, XIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeEventLog, formatUnits, type Hex } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { USDC_DECIMALS } from "@/lib/tokens";

import { cleanButton, cleanDialog, cn, dialogClose, dialogFooter } from "@/components/clean-ui";
import { BackingValue, PackRevealArt, RevealedCard, revealFrame } from "@/components/pack-reveal-art";
import { tickerForAsset, collectPacksAbi, collectPacksAddress } from "@/lib/collect-packs";
import { PACK_TIERS, RARITY_NAMES } from "@/lib/contracts";
import { basketForTier } from "@/lib/stock-assets";
import { TokenIcon } from "@/components/token-icon";
import type { MyPack } from "@/lib/use-my-packs";
import { playReveal, playTear, unlockAudio } from "@/lib/sfx";
import { txErrorMessage } from "@/lib/tx-error";
import { useWalletSync } from "@/lib/use-wallet-sync";

type Revealed = { ticker: string; rarity: number; usd: bigint; filled: boolean; amount: bigint; expired: boolean };

/**
 * On-chain pack opening on CollectPacks, styled like the demo reveal: a sealed
 * pack with a Reveal button, then the card the PackOpened log describes. A pack
 * commits to the block after its purchase, so it's ready one block later. The
 * same transaction swaps the card's value into its token (CardFilled); if the
 * swap guard refused, the card holds USDC until it's filled.
 */
export function LivePackReveal({
  ready,
  afterHash,
  onClose,
  onOpened,
  purchasedCount,
  tierName: boughtTier,
  autoOpen = false,
}: {
  ready: MyPack[];
  /** Kept for older callers; CollectPacks packs are never sealed. */
  sealed?: MyPack[];
  /** The purchase that led here: its successor waits for the wallet to catch up. */
  afterHash?: Hex;
  onClose: () => void;
  onOpened: () => void;
  /** Set when opened straight after a purchase: shows the ×N and "ready" copy. */
  purchasedCount?: number;
  tierName?: string;
  /** Start opening the first pack as soon as it can, without another tap (after "Open now"). */
  autoOpen?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });
  // Packs opened in this dialog, skipped until the parent's list catches up.
  const [done, setDone] = useState<bigint[]>([]);
  const remaining = ready.filter((p) => !done.includes(p.id));
  const [pack, setPack] = useState<MyPack | undefined>(ready[0]);

  // Each step here follows another transaction; wait for the wallet's nonce.
  const { syncing } = useWalletSync(hash ?? afterHash);

  function openNext() {
    const next = remaining[0];
    if (!next) return;
    unlockAudio();
    reset();
    setPack(next);
    writeContract(
      { address: collectPacksAddress, abi: collectPacksAbi, functionName: "open", args: [next.id] },
      { onSuccess: () => setDone((ids) => [...ids, next.id]) },
    );
  }

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const autoStarted = useRef(false);

  useEffect(() => {
    if (receipt.isSuccess) onOpened();
    // Only react to a newly confirmed reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const card = useMemo<Revealed | null>(() => {
    let opened: Revealed | null = null;
    let filledAmount: bigint | null = null;
    for (const log of receipt.data?.logs ?? []) {
      if (log.address.toLowerCase() !== collectPacksAddress.toLowerCase()) continue;
      try {
        const event = decodeEventLog({ abi: collectPacksAbi, data: log.data, topics: log.topics });
        if (event.eventName === "PackOpened") {
          const ticker = tickerForAsset(event.args.asset);
          if (ticker) opened = { ticker, rarity: event.args.rarity, usd: event.args.usd, filled: false, amount: 0n, expired: event.args.expired };
        }
        if (event.eventName === "CardFilled") filledAmount = event.args.amount;
      } catch { /* another event */ }
    }
    if (opened && filledAmount !== null) return { ...opened, filled: true, amount: filledAmount };
    return opened;
  }, [receipt.data]);

  const art = card ? cardArt(card.ticker, card.rarity, pack?.tier) : null;
  const phase = card && art ? "revealed" : error ? "failed" : isPending ? "confirm" : hash ? "opening" : "sealed";
  // Tear when the open transaction is sent; flourish when the card lands.
  useEffect(() => {
    if (phase === "opening") playTear();
    if (phase === "revealed" && card) playReveal(card.rarity);
    // Only react to phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  const tierId = pack?.tier ?? PACK_TIERS.find((t) => t.name === boughtTier)?.id;
  const tier = tierId != null ? PACK_TIERS[tierId] : undefined;
  const packName = tier?.name ?? boughtTier ?? "Pack";
  // A fresh pack needs one more block before it can open; the list catches up.
  const waiting = phase === "sealed" && remaining.length === 0;
  const message = error ? txErrorMessage(error, "Couldn’t open the pack.") : "";
  // After "Open now": open the first pack once it's ready, once.
  useEffect(() => {
    if (!autoOpen || autoStarted.current || phase !== "sealed" || waiting || syncing) return;
    autoStarted.current = true;
    openNext();
    // openNext reads the latest list; only these conditions should trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, phase, waiting, syncing]);

  const revealed = phase === "revealed" && art && card ? { art, card } : null;

  return (
    <dialog ref={dialog} className={cn(cleanDialog, revealFrame.dialog)} aria-labelledby="live-reveal-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <header className={revealFrame.header}>
        <span className={revealFrame.label}>[ {packName.toLowerCase()} · ${tier?.price ?? 1}{phase === "sealed" && purchasedCount !== undefined ? ` · ×${purchasedCount}` : ""} ]</span>
        <button type="button" className={dialogClose} onClick={onClose} aria-label="Close pack reveal"><XIcon className="size-[18px]" /></button>
      </header>
      <div className={cn(revealFrame.stage, revealed && revealFrame.stageRevealed)} aria-hidden="true">
        {revealed ? <RevealedCard art={revealed.art} rarity={revealed.card.rarity} /> : <PackRevealArt tier={tierId} motion={phase === "opening" ? "waiting" : "idle"} />}
      </div>
      {/* Sealed, the pack and the button say it all; the title stays for screen readers. */}
      <div className={phase === "sealed" ? "sr-only" : revealFrame.body}>
        <div role="status" aria-live="polite">
          <h2 id="live-reveal-title" className={phase === "sealed" ? "sr-only" : revealFrame.title}>
            {revealed ? revealed.art.name : phase === "sealed" ? (purchasedCount !== undefined ? `${purchasedCount} ${purchasedCount === 1 ? "pack" : "packs"} bought` : `${remaining.length} ${remaining.length === 1 ? "pack" : "packs"} ready`) : phase === "failed" ? "Couldn’t open" : phase === "confirm" ? "Confirm in wallet" : "Opening…"}
          </h2>
          {phase !== "sealed" && (
            <p className={cn(revealFrame.note, phase === "failed" ? "text-down" : "")}>
              {revealed ? `${RARITY_NAMES[revealed.card.rarity]} · ${revealed.card.ticker}${revealed.card.expired ? " · opened late" : ""}` : phase === "failed" ? message : phase === "confirm" ? "One transaction" : tierId != null ? `Draws from: ${basketForTier(tierId).join(" · ")}` : "Opening on-chain"}
            </p>
          )}
        </div>
        {revealed && (
          <dl className={revealFrame.details}>
            <div className={revealFrame.row}><dt className="text-muted">Pack</dt><dd>{packName}{tier ? ` · $${tier.price}` : ""}</dd></div>
            <div className={revealFrame.row}><dt className="text-muted">Stock</dt><dd className="inline-flex items-center gap-1.5"><TokenIcon symbol={revealed.card.ticker} className="size-4" />{revealed.card.ticker}</dd></div>
            <div className={revealFrame.row}><dt className="text-muted">Rarity</dt><dd>{RARITY_NAMES[revealed.card.rarity]}</dd></div>
            <div className={revealFrame.row}>
              <dt className="text-muted">Backing</dt>
              {/* Dollars at opening; a card the swap guard left unfilled holds USDC until it's filled. */}
              <dd><BackingValue ticker={revealed.card.filled ? revealed.card.ticker : "USDC"} usd={Number(formatUnits(revealed.card.usd, USDC_DECIMALS))} /></dd>
            </div>
          </dl>
        )}
        {revealed && !revealed.card.filled && (
          <p className={revealFrame.note}>The DEX price was off from the Atlas price, so this card holds its value in USDC for now. It can be filled with {revealed.card.ticker} later, or redeemed for the USDC.</p>
        )}
      </div>
      <div className={cn(dialogFooter, revealFrame.actions)}>
        {phase === "sealed" && (
          <button type="button" className={cn(cleanButton.solid, "w-full justify-between")} disabled={waiting || syncing} onClick={openNext}>
            {waiting ? "Waiting for the next block…" : syncing ? "Syncing wallet…" : "Reveal pack"} <ArrowUpRightIcon weight="bold" />
          </button>
        )}
        {phase === "failed" && <button type="button" className={cn(cleanButton.solid, "w-full justify-between")} onClick={openNext}>Try again <ArrowUpRightIcon weight="bold" /></button>}
        {revealed && (
          <>
            {/* Only offered while packs are left; the two links share a row to keep the pop-up short. */}
            {remaining.length > 0 && (
              <button type="button" className={cn(cleanButton.solid, "w-full justify-between")} disabled={syncing} onClick={openNext}>
                {syncing ? "Syncing wallet…" : `Open another · ${remaining.length} left`} <ArrowUpRightIcon weight="bold" />
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Link className={cn(remaining.length > 0 ? cleanButton.outline : cleanButton.solid, "w-full justify-between")} href="/collection" onClick={onClose}>Collection <ArrowUpRightIcon weight="bold" /></Link>
              <Link className={cn(cleanButton.outline, "w-full justify-between")} href="/marketplace" onClick={onClose}>Sell <ArrowUpRightIcon weight="bold" /></Link>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
