"use client";

import { CheckIcon, CopyIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useState } from "react";
import { formatEther } from "viem";
import { useAccount, useBalance } from "wagmi";

import { cn, gutter } from "@/components/clean-ui";
import { useDemo } from "@/components/demo-provider";
import { appChain } from "@/lib/chain";
import { useWalletAuth } from "@/lib/wallet-auth";

/** Below this, a wallet can't pay for much on BNB Chain (a dollar of BNB covers many actions). */
const LOW_AVAX = 0.001;
/** What "Buy BNB" suggests: plenty for months of normal use. */
const TOP_UP = "0.01";

const chip = "inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-strong bg-white px-3 text-sm transition-colors hover:border-black";

/**
 * New wallets (especially ones Privy makes for email sign-ins) start with no
 * BNB, and every action on BNB Chain needs a little for network fees. This
 * says so once, with a way to add some: buy with a card (Privy) or send BNB
 * to the address. Hidden in demo mode, on other networks, or once dismissed.
 */
export function GasNotice() {
  const demo = useDemo();
  const { address, chainId } = useAccount();
  const { fund } = useWalletAuth();
  const { data } = useBalance({ address, chainId: appChain.id, query: { enabled: Boolean(address), refetchInterval: 30_000 } });
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (demo.active || !address || chainId !== appChain.id || dismissed || data === undefined) return null;
  if (Number(formatEther(data.value)) >= LOW_AVAX) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(address!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the address is on the profile page.
    }
  }

  return (
    // Floats just under the nav (absolute inside the sticky header), so it never pushes the page down.
    <div className="pointer-events-none absolute inset-x-0 top-full">
      {/* Same side gutter as the header, so the card lines up with the wallet chip. */}
      <div className={cn("flex justify-end", gutter)}>
        <div className="pointer-events-auto mt-2 flex w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-white/72 p-4 shadow-[0_4px_16px_rgba(0,0,0,0.04)] backdrop-blur-[14px]" role="status">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm">
              <strong className="font-normal">Add a little BNB for network fees.</strong>{" "}
              <span className="text-muted">Every action on BNB Chain costs a fraction of a cent; your wallet has none yet.</span>
            </p>
            <button type="button" className="-m-1.5 grid size-8 shrink-0 place-items-center rounded-md text-muted hover:text-black" aria-label="Dismiss" onClick={() => setDismissed(true)}><XIcon size={16} /></button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {fund && <button type="button" className={chip} onClick={() => { void fund(address, TOP_UP).catch(() => {}); }}>Buy BNB</button>}
            <button type="button" className={chip} onClick={copy}>{copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy address"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
