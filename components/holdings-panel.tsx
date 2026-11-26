"use client";

import { PaperPlaneTiltIcon } from "@phosphor-icons/react/ssr";
import { useState } from "react";
import type { Address } from "viem";

import { cn } from "@/components/clean-ui";
import { useDemo } from "@/components/demo-provider";
import { SendDialog } from "@/components/send-dialog";
import { TokenIcon } from "@/components/token-icon";
import { sectionLabel, sectionTitle, sidePanel } from "@/components/market-parts";
import { usd } from "@/lib/use-stock-prices";
import { useWalletHoldings } from "@/lib/use-wallet-holdings";

const amount = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 4 });

/** A wallet's tokens and their estimated value: the connected one unless `account` is given. */
export function HoldingsPanel({ account }: { account?: Address }) {
  const { loaded, holdings, total, failed } = useWalletHoldings(account);
  const demo = useDemo();
  const [sending, setSending] = useState(false);
  // Only your own live wallet can send (not someone else's profile, not demo).
  const canSend = !account && !demo.active && loaded && holdings.some((h) => h.value > 0);
  return (
    <section id="holdings" className={cn(sidePanel, "desk:pt-10")} aria-labelledby="holdings-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="holdings-title" className={sectionTitle}>Holdings</h2>
        {canSend ? (
          <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm transition-colors hover:border-black" aria-haspopup="dialog" onClick={() => setSending(true)}><PaperPlaneTiltIcon /> Send</button>
        ) : (
          <span className={sectionLabel}>[ est. value ]</span>
        )}
      </div>
      <p className="mt-4 text-[40px] leading-[1.2] tracking-tight tabular-nums">{loaded ? usd(total) : "—"}</p>
      {loaded ? (
        <ul className="mt-6 border-t border-border" aria-label="Holdings">
          {holdings.map((h) => (
            <li key={h.label} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border py-3 text-base">
              {/* The token's logo (falls back to its first letter on its colour). */}
              <TokenIcon symbol={h.label} color={h.color} className="row-span-2 size-7" />
              <span className="truncate">{h.label}</span>
              <span className="text-right tabular-nums">{h.price === null ? "—" : usd(h.value * h.price)}</span>
              <span className="text-sm text-muted tabular-nums">{amount(h.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted" role="status">{failed ? "Couldn’t load balances. Retrying…" : "Loading holdings…"}</p>
      )}
      {sending && <SendDialog keys={holdings.filter((h) => h.value > 0).map((h) => h.key)} onClose={() => setSending(false)} />}
    </section>
  );
}
