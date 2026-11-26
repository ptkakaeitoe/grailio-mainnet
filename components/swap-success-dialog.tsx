"use client";

import { ArrowRightIcon, ArrowUpRightIcon, CheckIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef } from "react";

import { cleanButton, cleanDialog, cn, dialogFooter } from "@/components/clean-ui";
import { SNOWTRACE } from "@/lib/contracts";
import { playSuccess } from "@/lib/sfx";

/** Confirmation after a swap settles: what left, what arrived, and the tx. */
export function SwapSuccessDialog({ paid, received, hash, onClose }: { paid: string; received: string; hash?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    playSuccess();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={cn(cleanDialog, "w-[min(380px,calc(100%-32px))] animate-[swap-confirm_.35s_ease-out] motion-reduce:animate-none")}
      aria-labelledby="swap-success-title"
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="relative px-6 pt-10 pb-2 text-center">
        <button type="button" className="absolute top-3 right-3 grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-black" onClick={onClose} aria-label="Close">
          <XIcon className="size-[18px]" />
        </button>

        <span className="mx-auto grid size-11 place-items-center rounded-full bg-black text-white" aria-hidden="true"><CheckIcon className="size-5" /></span>
        <h2 id="swap-success-title" className="mt-5 text-2xl font-normal tracking-[-0.02em]">Swap complete</h2>

        <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 text-base tabular-nums">
          <span className="text-muted">{paid}</span>
          <ArrowRightIcon weight="bold" className="text-muted-soft" aria-label="for" />
          <span>{received}</span>
        </p>

        <p className="mt-2 text-sm text-muted">
          {hash ? (
            <a className="inline-flex items-center gap-1 transition-colors hover:text-black" href={`${SNOWTRACE}/tx/${hash}`} target="_blank" rel="noreferrer">
              View on BscScan <ArrowUpRightIcon weight="bold" />
            </a>
          ) : (
            "Demo · no real funds moved"
          )}
        </p>

      </div>
      <div className={dialogFooter}>
        <button type="button" className={cn(cleanButton.solid, "w-full justify-center")} onClick={onClose} autoFocus>Done</button>
      </div>
    </dialog>
  );
}
