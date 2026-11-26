"use client";

import { ShareNetworkIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cleanDialog, cn, dialogClose, dialogHeader, dialogLabel } from "@/components/clean-ui";

const chip = "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm transition-colors hover:border-black";

/** The pop-up's width: 420px, or the screen less 16px a side. */
const panelWidth = () => Math.min(420, window.innerWidth - 32);

/** "Share" on the profile: opens the ID card (QR, download, copy link, share) just under the button. */
export function ShareProfileButton({ card }: { card: ReactNode }) {
  const [place, setPlace] = useState<CSSProperties | null>(null);
  function open(button: HTMLElement) {
    const r = button.getBoundingClientRect();
    const width = panelWidth();
    // Right edge under the button's right edge, kept 16px inside the screen (the button sits left on phones).
    const left = Math.min(Math.max(16, r.right - width), window.innerWidth - width - 16);
    setPlace({ top: r.bottom + 8, left, width });
  }
  return (
    <>
      <button type="button" className={chip} aria-haspopup="dialog" onClick={(e) => open(e.currentTarget)}><ShareNetworkIcon /> Share</button>
      {place && <ShareDialog place={place} onClose={() => setPlace(null)}>{card}</ShareDialog>}
    </>
  );
}

function ShareDialog({ place, onClose, children }: { place: CSSProperties; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog
      ref={dialog}
      style={place}
      className={cn(cleanDialog, "drop-panel inset-auto m-0 max-h-[calc(100dvh-96px)]")}
      aria-labelledby="share-title"
      onCancel={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <header className={dialogHeader}>
        <h2 id="share-title" className={dialogLabel}>[ share profile · scan to view ]</h2>
        <button type="button" className={dialogClose} aria-label="Close" onClick={onClose}><XIcon className="size-[18px]" /></button>
      </header>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
