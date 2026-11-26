"use client";

import { XIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cleanButton, cleanDialog, cn, dialogClose, dialogFooter } from "@/components/clean-ui";
import { PackRevealArt, revealFrame } from "@/components/pack-reveal-art";
import { DemoPackReveal } from "@/components/demo-pack-reveal";
import { useDemo } from "@/components/demo-provider";
import { LivePackReveal } from "@/components/live-pack-reveal";
import { useMyPacks } from "@/lib/use-my-packs";

/**
 * Open the packs you hold right where you are (after claiming a gift, or from
 * the Gifts page). A just-claimed pack becomes openable a block later, so this
 * waits a moment before the reveal starts.
 */
export function ClaimedPackReveal({ onClose }: { onClose: () => void }) {
  const demo = useDemo();
  return demo.active ? <DemoPackReveal onClose={onClose} /> : <LiveReveal onClose={onClose} />;
}

function LiveReveal({ onClose }: { onClose: () => void }) {
  const { unopened, loading, refetch } = useMyPacks();
  const ready = unopened.filter((p) => p.ready).reverse(); // oldest first
  // Once the reveal starts it stays up until closed: opening the last pack empties
  // the list, which would otherwise swap the card for "No packs to open" mid-reveal.
  const [started, setStarted] = useState(false);
  if (!started && ready.length > 0) setStarted(true);
  // This opens right after a claim, when the pack list may still be the one cached
  // before it ("no packs"). Re-check every 2s and only call it empty after 30s.
  const [gaveUp, setGaveUp] = useState(false);
  const waiting = !started && ready.length === 0 && !gaveUp;
  useEffect(() => {
    if (!waiting) return;
    void refetch();
    const poll = setInterval(() => void refetch(), 2_000);
    const stop = setTimeout(() => setGaveUp(true), 30_000);
    return () => { clearInterval(poll); clearTimeout(stop); };
    // refetch is a new function each render; the poll only needs to start once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);
  if (started || ready.length > 0) return <LivePackReveal ready={ready} onClose={onClose} onOpened={refetch} autoOpen />;
  return <Waiting onClose={onClose} empty={gaveUp && !loading && unopened.length === 0} tier={unopened[0]?.tier} />;
}

/** Shown for the second or two before a new pack can be opened (or when there's nothing to open). */
function Waiting({ onClose, empty, tier }: { onClose: () => void; empty: boolean; tier?: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className={cn(cleanDialog, revealFrame.dialog)} aria-labelledby="pack-wait-title" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Same frame and pack as the reveal that follows, so nothing jumps. */}
      <header className={revealFrame.header}>
        <span className={revealFrame.label}>[ open pack ]</span>
        <button type="button" className={dialogClose} aria-label="Close" onClick={onClose}><XIcon className="size-[18px]" /></button>
      </header>
      <div className={revealFrame.stage} aria-hidden="true">
        <PackRevealArt tier={tier} motion={empty ? "idle" : "waiting"} />
      </div>
      <div className={revealFrame.body} role="status">
        <h2 id="pack-wait-title" className={revealFrame.title}>{empty ? "No packs to open." : "Getting your pack ready…"}</h2>
        <p className={revealFrame.note}>{empty ? "Your packs are all opened." : "A new pack opens a moment after it arrives."}</p>
      </div>
      {empty && (
        <div className={dialogFooter}>
          <Link href="/collection" className={cn(cleanButton.solid, "h-11 w-full justify-center")} onClick={onClose}>Your collection</Link>
        </div>
      )}
    </dialog>
  );
}
