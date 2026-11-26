"use client";

import type { Address } from "viem";

import { cn } from "@/components/clean-ui";
import { TokenIcon } from "@/components/token-icon";
import { sectionLabel, sectionTitle, sidePanel } from "@/components/market-parts";
import { usd } from "@/lib/use-stock-prices";
import { useWalletHoldings } from "@/lib/use-wallet-holdings";

const amount = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 4 });

/** A wallet's tokens and their estimated value: the connected one unless `account` is given. */
export function HoldingsPanel({ account }: { account?: Address }) {
  const { loaded, holdings, total, failed } = useWalletHoldings(account);
  return (
    <section id="holdings" className={cn(sidePanel, "desk:pt-10")} aria-labelledby="holdings-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="holdings-title" className={sectionTitle}>Holdings</h2>
        <span className={sectionLabel}>[ est. value ]</span>
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
    </section>
  );
}
