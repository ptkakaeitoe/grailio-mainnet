"use client";

import { ArrowUpRightIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useEffect, useRef, useState } from "react";
import { formatUnits, type Address } from "viem";
import { cleanDrawerRight, cn, dialogClose, dialogLabel } from "@/components/clean-ui";
import type { ActivityItem } from "@/lib/activity";
import { explorerUrl } from "@/lib/chain";
import { tickerForAsset } from "@/lib/collect-packs";
import { PACK_TIERS, RARITY_NAMES } from "@/lib/contracts";
import { tokenAmount } from "@/lib/format-amount";
import { TOKENS, PACK_DECIMALS } from "@/lib/tokens";

const usdc = (raw?: string) => {
  const n = raw ? Number(formatUnits(BigInt(raw), PACK_DECIMALS)) : 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 0.01 ? 6 : 2 })}`;
};
const when = (t: number) => {
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const packs = (n = 1, tier?: number) => `${n} ${tier !== undefined ? `${PACK_TIERS[tier]?.name ?? ""} ` : ""}${n === 1 ? "pack" : "packs"}`;
const price = (i: ActivityItem) => (i.inAvax ? `${tokenAmount(Number(formatUnits(BigInt(i.amount ?? "0"), 18)))} BNB` : usdc(i.amount));

/** One line per event: what happened, and the amount on the right. */
function describe(i: ActivityItem, assetOf: Map<string, number>): { title: string; value?: string; positive?: boolean } {
  const card = i.cardId ? `card #${i.cardId}` : "card";
  switch (i.kind) {
    case "bought": return { title: `Bought ${packs(i.quantity, i.tier)}`, value: `−${usdc(i.usdc)}` };
    case "revealed": return { title: `Revealed ${RARITY_NAMES[i.rarity ?? 0]} ${tickerForAsset(i.asset ?? 0) ?? ""} · ${card}`, value: usdc(i.usdc) };
    case "redeemed": {
      if (i.usdc) return { title: `Redeemed ${card}`, value: `+${usdc(i.usdc)}`, positive: true };
      const ticker = tickerForAsset(assetOf.get(i.cardId ?? "") ?? -1);
      const token = ticker ? TOKENS[ticker] : undefined;
      return { title: `Redeemed ${card}`, value: token ? `+${tokenAmount(Number(formatUnits(BigInt(i.amount ?? "0"), token.decimals)))} ${token.symbol}` : undefined, positive: true };
    }
    case "giftBought": return { title: `Bought a gift of ${packs(i.quantity, i.tier)}` };
    case "giftClaimed": return { title: "Claimed a gift" };
    case "refunded": return { title: "Refunded a pack", value: `+${usdc(i.usdc)}`, positive: true };
    case "staked": return { title: `Staked ${card}` };
    case "unstaked": return { title: `Unstaked ${card}` };
    case "claimed": return { title: "Claimed staking rewards", value: `+${usdc(i.usdc)}`, positive: true };
    case "listed": return { title: `Listed ${card}`, value: price(i) };
    case "cancelled": return { title: `Cancelled listing · ${card}` };
    case "sold": return { title: `Sold ${card}`, value: `+${price(i)}`, positive: true };
    case "purchased": return { title: `Bought ${card} on the market`, value: `−${price(i)}` };
  }
}

/** The wallet's on-chain history in Grailio, newest first (from /api/activity), in a drawer from the right. */
export function ActivityDrawer({ account, onClose }: { account: Address; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  // Slide back out to the right, then unmount (matches the .side-drawer transition).
  function dismiss() {
    dialog.current?.close();
    window.setTimeout(onClose, 340);
  }
  return (
    <dialog
      ref={dialog}
      className={cn(cleanDrawerRight, "w-[min(420px,calc(100vw-16px))]")}
      aria-labelledby="activity-title"
      onCancel={(e) => { e.preventDefault(); dismiss(); }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white py-2 pr-3 pl-5">
        <h2 id="activity-title" className={dialogLabel}>[ activity ]</h2>
        <button type="button" className={dialogClose} aria-label="Close activity" onClick={dismiss}><XIcon className="size-[18px]" /></button>
      </header>
      <div className="px-5 py-4"><ActivityList account={account} /></div>
    </dialog>
  );
}

/** The wallet's history as a plain list (the profile's Activity tab, and the drawer). */
export function ActivityList({ account }: { account: Address }) {
  const [state, setState] = useState<{ account: Address; items: ActivityItem[] | null; error: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/activity?address=${account}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((body: { items: ActivityItem[] }) => { if (!cancelled) setState({ account, items: body.items, error: false }); })
        .catch(() => { if (!cancelled) setState((s) => ({ account, items: s?.account === account ? s.items : null, error: true })); });
    void load();
    const timer = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [account]);

  const current = state?.account === account ? state : null;
  const items = current?.items ?? null;
  const assetOf = new Map((items ?? []).filter((i) => i.kind === "revealed" && i.cardId).map((i) => [i.cardId!, i.asset ?? 0]));

  if (items === null) return <p className="py-2 text-sm text-muted" role="status">{current?.error ? "Activity is unavailable right now." : "Loading activity…"}</p>;
  if (items.length === 0) return <p className="py-2 text-sm text-muted">Nothing yet. Buy a pack to start.</p>;
  return (
    <ul className="divide-y divide-border" aria-label={`${items.length} transactions`}>
      {items.map((i) => {
        const d = describe(i, assetOf);
        return (
          <li key={i.id}>
            <a href={`${explorerUrl}/tx/${i.tx}`} target="_blank" rel="noreferrer" className="group flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate group-hover:underline group-hover:underline-offset-4">{d.title}</span>
                <span className="flex items-center gap-1 text-[13px] text-muted">
                  {when(i.time)} <ArrowUpRightIcon weight="bold" className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </span>
              {d.value && <span className={d.positive ? "shrink-0 text-up tabular-nums" : "shrink-0 tabular-nums"}>{d.value}</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
