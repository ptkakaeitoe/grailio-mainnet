"use client";

import { ArrowRightIcon, ArrowUpRightIcon, PlusIcon, WalletIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useDemo } from "@/components/demo-provider";
import { useRouter } from "next/navigation";
import { useRef, useState, type CSSProperties } from "react";
import { useConnectWallet } from "@/components/beta-access";
import { cleanButton, cleanDialog, cn, dialogClose, dialogFooter, dialogHeader, dialogLabel } from "@/components/clean-ui";
import { NetworkSwitch } from "@/components/network-switch";

/**
 * "Connect": opens the get-started panel just under the nav's connect button (top right), or under whichever button
 * opened it when the nav one isn't shown; on phones it sits in the middle of the screen (.drop-panel in globals.css).
 * `navAnchor` marks the nav's button as that anchor.
 * `icon`: a + after the label that spins on hover (everywhere), or a wallet before it (the nav only).
 */
export function WalletEntry({ className = cleanButton.solid, disabled = false, navAnchor = false, icon = "plus" }: { className?: string; disabled?: boolean; navAnchor?: boolean; icon?: "wallet" | "plus" }) {
  const demo = useDemo();
  const dialog = useRef<HTMLDialogElement>(null);
  const [place, setPlace] = useState<CSSProperties>();
  const close = () => dialog.current?.close();
  function open(trigger: HTMLElement) {
    const nav = document.querySelector<HTMLElement>("[data-wallet-anchor]");
    const anchor = nav && nav.getClientRects().length > 0 ? nav : trigger;
    const r = anchor.getBoundingClientRect();
    // Right edge under the anchor's right edge, but never past either side: on narrow screens the panel is nearly
    // full width, so it slides right until its left edge sits 16px in (matches w-[min(380px,calc(100vw-32px))]).
    const width = Math.min(380, window.innerWidth - 32);
    setPlace({ top: r.bottom + 8, right: Math.min(Math.max(16, window.innerWidth - r.right), window.innerWidth - width - 16) });
    dialog.current?.showModal();
  }
  const { openConnect } = useConnectWallet();
  const router = useRouter();

  return <>
    <button type="button" className={className} disabled={disabled} aria-haspopup="dialog" data-wallet-anchor={navAnchor || undefined} onClick={(e) => open(e.currentTarget)}>
      {icon === "wallet" && <WalletIcon className="size-4" aria-hidden="true" />}
      <span>Connect<span className="wallet-word"> wallet</span></span>
      {icon === "plus" && <PlusIcon className="plus-spin" aria-hidden="true" />}
    </button>
    <dialog ref={dialog} style={place} aria-labelledby="get-started-title" className={cn(cleanDialog, "drop-panel inset-auto m-0 w-[min(380px,calc(100vw-32px))] max-h-[calc(100dvh-96px)]")} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <header className={dialogHeader}>
        <span className={dialogLabel}>[ get started ]</span>
        <button type="button" className={dialogClose} aria-label="Close" onClick={close}><XIcon /></button>
      </header>
      <div className="p-6">
        <NetworkSwitch wide className="mb-6" />
        <h2 id="get-started-title" className="text-3xl leading-[1.1] font-light tracking-[-0.02em]">Your next move.</h2>
        <p className="mt-4 text-sm leading-relaxed text-muted">Connect to trade and collect, or take a look around.</p>
      </div>
      <div className={cn(dialogFooter, "flex flex-col gap-3")}>
        <button type="button" className={cn(cleanButton.solid, "w-full justify-between")} onClick={() => { close(); demo.exit(); openConnect(); }}>
          Connect wallet <ArrowUpRightIcon weight="bold" className="arrow-nudge" aria-hidden="true" />
        </button>
        <button type="button" className={cn(cleanButton.outline, "w-full justify-between")} onClick={() => { close(); demo.start(); router.push("/packs"); }}>
          Try demo <ArrowRightIcon weight="bold" className="arrow-slide" aria-hidden="true" />
        </button>
      </div>
    </dialog>
  </>;
}
