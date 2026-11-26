"use client";

import { ArrowUpRightIcon } from "@phosphor-icons/react/ssr";
import { erc20Abi, formatUnits, type Address } from "viem";
import { useBalance, useReadContracts } from "wagmi";
import { explorerUrl } from "@/lib/chain";
import { collectStakingAddress, collectStakingLive } from "@/lib/collect-packs";
import { tokenAmount } from "@/lib/format-amount";
import { SWAP_FEE_BPS, SWAP_FEE_STAKING_BPS, SWAP_FEE_TREASURY } from "@/lib/swap-fee";
import { TOKENS } from "@/lib/tokens";

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const addressLink = (a: Address, label: string) => (
  <a className="inline-flex items-center gap-1 text-black underline-offset-4 hover:underline" href={`${explorerUrl}/address/${a}`} target="_blank" rel="noreferrer">
    {label} {short(a)} <ArrowUpRightIcon weight="bold" className="size-3" />
  </a>
);

/** Treasury page: how swap fees are charged and split, and what the treasury wallet holds. */
export function SwapFeesSection() {
  const erc20s = Object.values(TOKENS).filter((t) => !t.native);
  const balances = useReadContracts({
    allowFailure: true,
    contracts: erc20s.map((t) => ({ address: t.address, abi: erc20Abi, functionName: "balanceOf" as const, args: [SWAP_FEE_TREASURY] as const })),
    query: { refetchInterval: 60_000 },
  });
  const avax = useBalance({ address: SWAP_FEE_TREASURY, query: { refetchInterval: 60_000 } });
  const held = [
    ...(avax.data ? [{ symbol: "BNB", amount: Number(formatUnits(avax.data.value, 18)) }] : []),
    ...erc20s.map((t, i) => {
      const row = balances.data?.[i];
      return { symbol: t.symbol, amount: row?.status === "success" ? Number(formatUnits(row.result as bigint, t.decimals)) : 0 };
    }),
  ].filter((h) => h.amount > 0);

  const toStaking = collectStakingLive ? SWAP_FEE_STAKING_BPS : 0;
  const row = "flex items-baseline justify-between gap-4 border-b border-border py-2.5 text-sm";
  return (
    <section className="mt-12 border-t border-border pt-8" aria-labelledby="swap-fees-title">
      <h2 id="swap-fees-title" className="text-xl font-normal">Swap fees</h2>
      <p className="mt-3 max-w-[560px] text-base leading-relaxed text-muted">
        Every swap on Trade pays {pct(SWAP_FEE_BPS)}, taken by KyberSwap inside the swap. When USDC is on either side, the fee is in USDC and half goes straight to stakers.
      </p>
      <dl className="mt-5 max-w-[560px] border-t border-border">
        <div className={row}><dt className="text-muted">Fee</dt><dd><span className="tabular-nums">{pct(SWAP_FEE_BPS)}</span> of each swap</dd></div>
        <div className={row}>
          <dt className="text-muted">USDC swaps</dt>
          <dd className="text-right">
            {toStaking > 0 ? <><span className="tabular-nums">{pct(toStaking)}</span> to staking · <span className="tabular-nums">{pct(SWAP_FEE_BPS - toStaking)}</span> to treasury</> : <><span className="tabular-nums">{pct(SWAP_FEE_BPS)}</span> to treasury</>}
          </dd>
        </div>
        <div className={row}><dt className="text-muted">Other swaps</dt><dd className="text-right">{pct(SWAP_FEE_BPS)} to treasury, in the token paid</dd></div>
        {collectStakingLive && <div className={row}><dt className="text-muted">Staking share to</dt><dd>{addressLink(collectStakingAddress, "Staking")}</dd></div>}
        <div className={row}><dt className="text-muted">Treasury share to</dt><dd>{addressLink(SWAP_FEE_TREASURY, "Wallet")}</dd></div>
        <div className={row}>
          <dt className="text-muted">Treasury wallet holds</dt>
          <dd className="text-right tabular-nums">
            {balances.isLoading ? "…" : held.length ? held.map((h) => `${tokenAmount(h.amount)} ${h.symbol}`).join(" · ") : "Nothing yet"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 max-w-[560px] text-[13px] leading-relaxed text-muted">
        Staking counts the USDC it receives at its next sync (any stake, claim or Distribute). To share non-USDC fees too, swap them to USDC and add them to the pack pool as revenue; Distribute then sends the staking share. The treasury wallet is the deployer for now and also holds gas.
      </p>
    </section>
  );
}
