"use client";

import { ArrowRightIcon, ArrowUpRightIcon, CheckIcon, CircleNotchIcon, XIcon } from "@phosphor-icons/react/ssr";
import { useEffect } from "react";
import { usePublicClient } from "wagmi";
import { cn } from "@/components/clean-ui";
import { explorerUrl } from "@/lib/chain";
import { updateSwap, useRecentSwaps, type SwapStatus } from "@/lib/recent-swaps";

const ago = (t: number) => {
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const STATUS: Record<SwapStatus, { label: string; icon: React.ReactNode; className: string }> = {
  pending: { label: "Pending", icon: <CircleNotchIcon className="size-3.5 animate-spin" />, className: "text-muted" },
  confirmed: { label: "Confirmed", icon: <CheckIcon className="size-3.5" />, className: "text-up" },
  failed: { label: "Failed", icon: <XIcon className="size-3.5" />, className: "text-down" },
};

/** Your recent swaps from this browser, with live status; pending ones are re-checked on-chain. */
export function RecentTrades({ owner, demo }: { owner: string | null | undefined; demo: boolean }) {
  const swaps = useRecentSwaps(owner);
  const client = usePublicClient();
  const pending = swaps.filter((s) => s.status === "pending" && s.hash);
  const pendingKey = pending.map((s) => s.hash).join(",");

  // Swaps still pending (e.g. after a reload): look up their receipts until they settle.
  useEffect(() => {
    if (!client || !owner || !pendingKey) return;
    let cancelled = false;
    const check = async () => {
      for (const hash of pendingKey.split(",") as `0x${string}`[]) {
        try {
          const receipt = await client.getTransactionReceipt({ hash });
          if (!cancelled) updateSwap(owner, { hash }, { status: receipt.status === "success" ? "confirmed" : "failed" });
        } catch {
          // Not mined yet: try again next round.
        }
      }
    };
    void check();
    const id = setInterval(check, 5_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [client, owner, pendingKey]);

  if (!owner) return null;
  return (
    <section className="recent-trades mt-10 border-t border-border pt-8" aria-labelledby="recent-trades-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="recent-trades-title" className="text-[22px] leading-[1.3] font-normal tracking-tight">Recent trades</h2>
        {demo && <span className="text-sm text-muted">[ demo ]</span>}
      </div>
      {swaps.length === 0 ? (
        <p className="mt-5 text-sm text-muted">No trades yet.</p>
      ) : (
        <ul className="mt-5 divide-y divide-border border-y border-border">
          {swaps.slice(0, 8).map((s) => {
            const st = STATUS[s.status];
            const row = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm tabular-nums">
                    <span className="truncate">{s.paid}</span>
                    <ArrowRightIcon weight="bold" className="size-3.5 shrink-0 text-muted" />
                    <span className="truncate">{s.received}</span>
                  </span>
                  <span className="text-[13px] text-muted">{ago(s.time)}</span>
                </span>
                <span className={cn("inline-flex shrink-0 items-center gap-1 text-[13px]", st.className)}>{st.icon} {st.label}</span>
                {s.hash && <ArrowUpRightIcon weight="bold" className="size-3.5 shrink-0 text-muted" aria-hidden="true" />}
              </>
            );
            return (
              <li key={s.id}>
                {s.hash ? (
                  <a className="flex items-center gap-3 py-2.5 hover:bg-surface-muted/60" href={`${explorerUrl}/tx/${s.hash}`} target="_blank" rel="noreferrer" aria-label={`${s.paid} to ${s.received}, ${st.label}, view transaction`}>{row}</a>
                ) : (
                  <div className="flex items-center gap-3 py-2.5">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
