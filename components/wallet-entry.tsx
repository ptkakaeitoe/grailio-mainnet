"use client";

import { ArrowUpRightIcon, PlayIcon, PlusIcon, WalletIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useDemo } from "@/components/demo-provider";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useConnectWallet } from "@/components/beta-access";
import { cleanButton, cleanDialog, cn, dialogClose, dialogHeader } from "@/components/clean-ui";
import { NetworkSwitch } from "@/components/network-switch";
import { appChain } from "@/lib/chain";

const walletRow = "flex min-h-[72px] w-full items-center gap-3.5 rounded-lg border border-border px-4 text-left transition-colors hover:border-black disabled:opacity-40 disabled:hover:border-border";
const rowIcon = "grid size-10 shrink-0 place-items-center rounded-full bg-surface-muted";

/**
 * "Connect": a centred connect modal with the Testnet / Mainnet switch and the ways in, the same panel as the
 * testnet app. `navAnchor` is kept for callers; the modal no longer drops from the nav button.
 */
export function WalletEntry({ className = cleanButton.solid, disabled = false, navAnchor = false }: { className?: string; disabled?: boolean; navAnchor?: boolean }) {
  const demo = useDemo();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  const { openConnect } = useConnectWallet();
  const router = useRouter();

  return <>
    <button type="button" className={className} disabled={disabled} aria-haspopup="dialog" data-wallet-anchor={navAnchor || undefined} onClick={() => dialog.current?.showModal()}>
      <span>Connect<span className="wallet-word"> wallet</span></span><span aria-hidden="true"><PlusIcon /></span>
    </button>
    <dialog ref={dialog} aria-label="Connect a wallet" className={cn(cleanDialog, "w-[min(460px,calc(100vw-24px))] max-h-[calc(100dvh-48px)]")} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <header className={dialogHeader}>
        <h2 className="text-lg leading-tight font-normal">Connect</h2>
        <button type="button" className={dialogClose} aria-label="Close" onClick={close}><XIcon /></button>
      </header>
      <div className="flex flex-col gap-6 p-5 phone:p-6">
        <NetworkSwitch wide />
        <div className="flex flex-col gap-2.5">
          <button type="button" className={walletRow} onClick={() => { close(); demo.exit(); openConnect(); }}>
            <span className={rowIcon}><WalletIcon className="size-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-base">Wallet or email</span>
              <span className="block truncate text-[13px] text-muted">Beta code required</span>
            </span>
            <ArrowUpRightIcon className="size-4 text-muted" aria-hidden="true" />
          </button>
          <button type="button" className={walletRow} onClick={() => { close(); demo.start(); router.push("/packs"); }}>
            <span className={rowIcon}><PlayIcon className="size-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-base">Try the demo</span>
              <span className="block text-[13px] text-muted">No wallet needed</span>
            </span>
            <ArrowUpRightIcon className="size-4 text-muted" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="border-t border-border px-5 py-4 text-[13px] text-muted phone:px-6">{appChain.name}</p>
    </dialog>
  </>;
}
