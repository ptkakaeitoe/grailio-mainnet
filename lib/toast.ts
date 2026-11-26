"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import type { Hex } from "viem";
import { explorerUrl } from "@/lib/chain";
import { playPurchase, playSuccess } from "@/lib/sfx";
import { txErrorMessage } from "@/lib/tx-error";

/**
 * App-wide notifications (bottom of the screen): a tiny store plus
 * `useTxToast`, which follows one transaction from the wallet prompt to its
 * confirmation. Rendered by components/toaster.tsx.
 */
export type ToastKind = "loading" | "success" | "error";
export type Toast = { id: number; kind: ToastKind; title: string; detail?: string; href?: string };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const emit = () => listeners.forEach((l) => l());

/** Show a toast, or update toast `id` in place. Finished toasts hide after a few seconds. */
export function showToast(t: Omit<Toast, "id">, id?: number | null): number {
  const toastId = id ?? nextId++;
  const next = { ...t, id: toastId };
  toasts = toasts.some((x) => x.id === toastId) ? toasts.map((x) => (x.id === toastId ? next : x)) : [...toasts, next].slice(-4);
  clearTimeout(timers.get(toastId));
  if (t.kind !== "loading") timers.set(toastId, setTimeout(() => dismissToast(toastId), t.kind === "error" ? 8000 : 5000));
  emit();
  return toastId;
}

export function dismissToast(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

export const subscribeToasts = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const readToasts = () => toasts;
const NONE: Toast[] = [];
export const serverToasts = () => NONE;

/** What a transaction is called while it runs and once it's done, e.g. "Cancelling listing" / "Listing cancelled". */
/** `sound`: the chime when it confirms (default "success"; "purchase" is the ka-ching). */
export type TxLabels = { loading: string; success: string; sound?: "success" | "purchase" | "none" };

/**
 * Follows one wagmi transaction with a single toast: "Confirm in your wallet",
 * then "Confirming…", then done (with a BscScan link) or the error.
 * Pass `labels: null` to stay quiet.
 */
export function useTxToast(
  tx: { isPending: boolean; hash?: Hex; confirming: boolean; success: boolean; error: Error | null },
  labels: TxLabels | null,
) {
  const id = useRef<number | null>(null);
  const finished = useRef<string | null>(null);
  const { isPending, hash, confirming, success, error } = tx;
  useEffect(() => {
    if (!labels) return;
    const href = hash ? `${explorerUrl}/tx/${hash}` : undefined;
    if (isPending) {
      finished.current = null;
      id.current = showToast({ kind: "loading", title: labels.loading, detail: "Confirm in your wallet…" }, id.current);
    } else if (error) {
      if (finished.current === `err:${error.message}`) return;
      finished.current = `err:${error.message}`;
      showToast({ kind: "error", title: `${labels.loading} failed`, detail: txErrorMessage(error), href }, id.current);
      id.current = null;
    } else if (hash && success) {
      if (finished.current === hash) return;
      finished.current = hash;
      showToast({ kind: "success", title: labels.success, href }, id.current);
      if (labels.sound === "purchase") playPurchase();
      else if (labels.sound !== "none") playSuccess();
      id.current = null;
    } else if (hash && confirming) {
      id.current = showToast({ kind: "loading", title: labels.loading, detail: "Confirming on BNB Chain…", href }, id.current);
    }
  }, [labels, isPending, hash, confirming, success, error]);
}

/** Toast wording for each contract call the app makes; the card id comes from the args. */
export function txLabelsFor(functionName: string, args?: readonly unknown[]): TxLabels | null {
  const idArg = args?.find((a, i) => typeof a === "bigint" && i <= 1) as bigint | undefined;
  const ids = Array.isArray(args?.[0]) ? (args[0] as bigint[]) : null;
  const card = ids ? (ids.length === 1 ? `card #${ids[0]}` : `${ids.length} cards`) : idArg !== undefined ? `card #${idArg}` : "card";
  const Card = card.charAt(0).toUpperCase() + card.slice(1);
  switch (functionName) {
    case "list": return { loading: `Listing ${card}`, success: `${Card} listed`, sound: "purchase" };
    case "cancel": return { loading: "Cancelling listing", success: "Listing cancelled" };
    case "buy": return args?.length === 4 ? { loading: `Buying ${card}`, success: `${Card} is yours`, sound: "purchase" } : null;
    case "approve": return { loading: "Approving USDC", success: "USDC approved" };
    case "setApprovalForAll": return { loading: "Approving cards", success: "Cards approved" };
    case "stake": return { loading: `Staking ${card}`, success: `${Card} staked` };
    case "unstake": return { loading: `Unstaking ${card}`, success: `${Card} unstaked` };
    case "claim": return { loading: "Claiming rewards", success: "Rewards claimed" };
    case "fill": return { loading: `Filling ${card}`, success: `${Card} filled` };
    case "redeem": return { loading: `Redeeming ${card}`, success: `${Card} redeemed` };
    case "distribute": return { loading: "Distributing revenue", success: "Revenue distributed" };
    case "withdraw": case "withdrawAll": return { loading: "Withdrawing", success: "Withdrawn" };
    case "withdrawAvaxFees": return { loading: "Withdrawing BNB fees", success: "BNB fees withdrawn" };
    case "sync": return { loading: "Starting staking payout", success: "Staking payout started" };
    default: return null;
  }
}

/**
 * Drop-in for wagmi's useWriteContract that also shows a toast for each call
 * (named by txLabelsFor). Reverted transactions show as failed.
 */
export function useToastedWrite() {
  const w = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: w.data });
  const [labels, setLabels] = useState<TxLabels | null>(null);
  const reverted = receipt.data?.status === "reverted";
  useTxToast(
    {
      isPending: w.isPending,
      hash: w.data,
      confirming: receipt.isLoading,
      success: receipt.isSuccess && !reverted,
      error: w.error ?? receipt.error ?? (reverted ? new Error("The transaction was reverted.") : null),
    },
    labels,
  );
  const { writeContract: write } = w;
  const send = useCallback(
    (call: { functionName: string; args?: readonly unknown[] }, options?: unknown) => {
      setLabels(txLabelsFor(call.functionName, call.args));
      (write as (c: unknown, o?: unknown) => void)(call, options);
    },
    [write],
  );
  return { ...w, writeContract: send as typeof write };
}
