"use client";

import { CheckIcon, CopyIcon, GiftIcon, ShareNetworkIcon, XIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { cleanDialog, cn, dialogClose, dialogFooter, dialogHeader, dialogLabel } from "@/components/clean-ui";
import { MiniPackArt } from "@/components/pack-art";
import { PACK_TIERS } from "@/lib/contracts";
import { editionForTier } from "@/lib/editions";
import { giftLink } from "@/lib/gift-code";

const chip = "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm transition-colors hover:border-black";

/** Copy code, copy link and (where supported) share, for one gift code. */
export function GiftShareActions({ code, tier, quantity }: { code: string; tier: number; quantity: number }) {
  const [copied, setCopied] = useState<"" | "code" | "link">("");
  const name = PACK_TIERS.find((t) => t.id === tier)?.name ?? "Grailio";
  const text = `I got you ${quantity === 1 ? `a ${name} pack` : `${quantity} ${name} packs`} on Grailio. Claim with code ${code}`;
  async function copy(what: "code" | "link") {
    try {
      await navigator.clipboard.writeText(what === "code" ? code : giftLink(code));
      setCopied(what);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      // Clipboard blocked: the code is on screen to copy by hand.
    }
  }
  return (
    // Buttons split the row evenly, so there is no gap left on one side.
    <div className="flex gap-1.5 [&>button]:flex-1 [&>button]:justify-center">
      <button type="button" className={chip} onClick={() => copy("code")}>{copied === "code" ? <CheckIcon /> : <CopyIcon />} {copied === "code" ? "Copied" : "Copy code"}</button>
      <button type="button" className={chip} onClick={() => copy("link")}>{copied === "link" ? <CheckIcon /> : <CopyIcon />} {copied === "link" ? "Copied" : "Copy link"}</button>
      {typeof navigator !== "undefined" && "share" in navigator && (
        <button type="button" className={chip} onClick={() => { navigator.share({ title: "A Grailio gift", text, url: giftLink(code) }).catch(() => {}); }}><ShareNetworkIcon /> Share</button>
      )}
    </div>
  );
}

/** Shown right after buying a gift: the code to send, once. */
export function GiftCodeDialog({ code, tier, quantity, demo, onClose }: { code: string; tier: number; quantity: number; demo: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const name = PACK_TIERS.find((t) => t.id === tier)?.name ?? "Pack";
  return (
    <dialog ref={dialog} className={cn(cleanDialog, "w-[min(460px,calc(100%-32px))]")} aria-labelledby="gift-title" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <header className={dialogHeader}>
        <span className={dialogLabel}>[ gift · {name.toLowerCase()} · ×{quantity}{demo ? " · demo" : ""} ]</span>
        <button type="button" className={dialogClose} aria-label="Close" onClick={onClose}><XIcon className="size-[18px]" /></button>
      </header>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-center gap-4">
          <MiniPackArt edition={editionForTier(tier)} width={48} />
          <div>
            <h2 id="gift-title" className="text-xl font-normal">{quantity === 1 ? `A ${name} pack` : `${quantity} ${name} packs`}, ready to give.</h2>
            <p className="mt-1 text-sm text-muted">Anyone with this code can claim {quantity === 1 ? "it" : "them"}.</p>
          </div>
        </div>
        <p className="rounded-md border border-dashed border-border-strong bg-surface-muted px-4 py-3 text-center font-mono text-[15px] tracking-wide break-all select-all">{code}</p>
      </div>
      <div className={cn(dialogFooter, "flex flex-col gap-3")}>
        <GiftShareActions code={code} tier={tier} quantity={quantity} />
        <p className="text-center text-[13px] text-muted">
          {demo ? "Demo: the other person claims it in demo mode." : "Cancel anytime before it’s claimed."}{" "}
          <Link href="/collection" className="text-black underline underline-offset-4" onClick={onClose}>Your gifts</Link>
        </p>
      </div>
    </dialog>
  );
}

export { GiftIcon };
