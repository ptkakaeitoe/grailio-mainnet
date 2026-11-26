"use client";

import { cardArt } from "@/lib/cards";
import { ArrowUpRightIcon, XIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDemo } from "@/components/demo-provider";
// Demo mode uses the stock set.
import { DEMO_STOCK_CARDS as STOCK_CARDS } from "@/lib/cards";
import { PACK_TIERS, RARITY_NAMES } from "@/lib/contracts";
import { useStockPrices } from "@/lib/use-stock-prices";
import type { DemoCard } from "@/lib/demo-economy";
import { cleanButton, cleanDialog, cn, dialogClose, dialogFooter } from "@/components/clean-ui";
import { BackingValue, PackRevealArt, RevealedCard, revealFrame } from "@/components/pack-reveal-art";
import { playReveal, playTear, unlockAudio } from "@/lib/sfx";

export function DemoPackReveal({ onClose, purchasedCount }: { onClose: () => void; purchasedCount?: number }) {
  const demo = useDemo();
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const [phase, setPhase] = useState<"purchased" | "opening" | "revealed">("purchased");
  const [revealed, setRevealed] = useState<DemoCard | null>(null);
  const { byTicker, failed } = useStockPrices(15_000); // refresh faster while the dialog is open
  const prices = Object.fromEntries(STOCK_CARDS.map(c => [c.ticker, byTicker[c.ticker]?.price ?? 0]));
  const quotesReady = !failed && Object.values(prices).every(p => Number.isFinite(p) && p > 0);
  const [message, setMessage] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (phase !== "opening") return;
    const timer = setTimeout(() => setPhase("revealed"), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1200);
    return () => clearTimeout(timer);
  }, [phase]);
  // Tear while the seal breaks; flourish (scaled by rarity) when the card lands.
  useEffect(() => {
    if (phase === "opening") playTear();
    if (phase === "revealed" && revealed) playReveal(revealed.rarity);
  }, [phase, revealed]);
  function reveal() {
    unlockAudio(); // the tear and reveal sounds play after this tap, so allow them now
    if (locked.current || (demo.balances.PACK ?? 0) < 1) return;
    locked.current = true;
    const result = quotesReady ? demo.openPack(prices) : null;
    if (!result) { locked.current = false; setMessage("Couldn't open the pack. Try again in a moment."); return; }
    setMessage("");
    setRevealed(result);
    setPhase("opening");
  }
  const card = revealed ? cardArt(revealed.ticker, revealed.rarity, revealed.tier) : null;
  const tierId = revealed?.tier ?? demo.packs[0];
  const tier = PACK_TIERS.find(t => t.id === tierId);
  const packName = tier?.name ?? "Pack";
  const left = demo.balances.PACK ?? 0;
  return <dialog ref={dialog} className={cn(cleanDialog, revealFrame.dialog)} aria-labelledby="pack-celebration-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <header className={revealFrame.header}>
      <span className={revealFrame.label}>[ {packName.toLowerCase()} · ${tier?.price ?? 1} · demo{phase === "purchased" && purchasedCount !== undefined ? ` · ×${purchasedCount}` : ""} ]</span>
      <button type="button" className={dialogClose} onClick={onClose} aria-label="Close pack reveal"><XIcon className="size-[18px]" /></button>
    </header>
    <div className={cn(revealFrame.stage, phase === "revealed" && card && revealed && revealFrame.stageRevealed)} aria-hidden="true">
      {phase === "revealed" && card && revealed ? <RevealedCard art={card} rarity={revealed.rarity} /> : <PackRevealArt tier={tierId} motion={phase === "opening" ? "opening" : "idle"} />}
    </div>
    <div className={phase === "purchased" && !message ? "sr-only" : revealFrame.body}>
      <div role="status" aria-live="polite">
        <h2 id="pack-celebration-title" className={phase === "purchased" ? "sr-only" : revealFrame.title}>{phase === "purchased" ? `${left} ${left === 1 ? "pack" : "packs"} ready` : phase === "opening" ? "Opening…" : card?.name}</h2>
        {phase !== "purchased" && <p className={revealFrame.note}>{phase === "opening" ? "Breaking the seal" : revealed ? `${RARITY_NAMES[revealed.rarity]} · ${revealed.ticker} · simulated` : ""}</p>}
      </div>
      {revealed && phase === "revealed" && (
        <dl className={revealFrame.details}>
          <div className={revealFrame.row}><dt className="text-muted">Pack</dt><dd>{packName}{tier ? ` · $${tier.price}` : ""}</dd></div>
          <div className={revealFrame.row}><dt className="text-muted">Rarity</dt><dd>{RARITY_NAMES[revealed.rarity]}</dd></div>
          <div className={revealFrame.row}><dt className="text-muted">Backing</dt><dd><BackingValue ticker={revealed.ticker} usd={tier?.backing[revealed.rarity] ?? 0} /></dd></div>
        </dl>
      )}
      {message && <p className={cn(revealFrame.note, "mt-4 text-down")} role="alert">{message}</p>}
    </div>
    <div className={cn(dialogFooter, revealFrame.actions)}>
      {phase === "purchased" && <button disabled={!quotesReady} type="button" className={cn(cleanButton.solid, "w-full justify-between")} onClick={reveal}>{quotesReady ? "Reveal pack" : failed ? "Prices unavailable, retrying…" : "Loading prices…"} <ArrowUpRightIcon weight="bold" /></button>}
      {phase === "revealed" && <>
        <button type="button" className={cn(cleanButton.solid, "w-full justify-between")} disabled={!quotesReady || left < 1} onClick={() => { locked.current = false; reveal(); }}>{left > 0 ? `Open another · ${left} left` : "No more packs"} <ArrowUpRightIcon weight="bold" /></button>
        <Link className={cn(cleanButton.outline, "w-full justify-between")} href="/collection" onClick={onClose}>View collection <ArrowUpRightIcon weight="bold" /></Link>
      </>}
    </div>
  </dialog>;
}
