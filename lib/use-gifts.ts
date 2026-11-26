"use client";

import { useState, useSyncExternalStore } from "react";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from "wagmi";

import { collectPacksAbi, collectPacksAddress, collectPacksLive } from "@/lib/collect-packs";
import { giftAccount, normalizeCode } from "@/lib/gift-code";

/**
 * Live gifts on CollectPacks. The code is the only way to claim, and it exists
 * only where it was made, so the gifts you send are kept in this browser
 * (per wallet) with their codes. Status is read from the contract.
 */
export type SentGift = { code: string; signer: Address; tier: number; quantity: number; createdAt: number; cancelled?: boolean };

const keyFor = (account: string) => `collect-gifts-${account.toLowerCase()}`;
const listeners = new Set<() => void>();
const cache = new Map<string, SentGift[]>();
const EMPTY: SentGift[] = [];

function readSent(account: string | undefined): SentGift[] {
  if (!account) return EMPTY;
  const key = keyFor(account);
  if (!cache.has(key)) {
    try {
      cache.set(key, JSON.parse(localStorage.getItem(key) ?? "[]") as SentGift[]);
    } catch {
      cache.set(key, []);
    }
  }
  return cache.get(key)!;
}

/** Saves a gift before its transaction is sent, so the code is never lost. */
export function saveSentGift(account: string, gift: SentGift) {
  const key = keyFor(account);
  const next = [gift, ...readSent(account).filter((g) => g.code !== gift.code)];
  cache.set(key, next);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage blocked: the code is still shown once, to copy.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type GiftStatus = "pending" | "open" | "claimed" | "cancelled";

/** Your sent gifts with their on-chain status, plus cancel. */
export function useSentGifts() {
  const { address } = useAccount();
  const sent = useSyncExternalStore(subscribe, () => readSent(address), () => EMPTY);
  const ids = useReadContracts({
    contracts: sent.map((g) => ({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "giftIdOf" as const, args: [g.signer] as const })),
    query: { enabled: collectPacksLive && sent.length > 0, refetchInterval: 15_000 },
  });
  const giftIds = sent.map((_, i) => (ids.data?.[i]?.result as bigint | undefined) ?? 0n);
  const details = useReadContracts({
    contracts: giftIds.map((id) => ({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "gifts" as const, args: [id] as const })),
    query: { enabled: collectPacksLive && giftIds.some((id) => id > 0n), refetchInterval: 15_000 },
  });
  const { writeContractAsync, isPending } = useWriteContract();

  const gifts = sent.map((g, i) => {
    const id = giftIds[i];
    const done = (details.data?.[i]?.result as readonly unknown[] | undefined)?.[4] === true;
    // Not on chain yet: the purchase is still confirming (or was never sent).
    const status: GiftStatus = id === 0n ? "pending" : !done ? "open" : g.cancelled ? "cancelled" : "claimed";
    return { ...g, id, status };
  });

  async function cancel(code: string) {
    const g = gifts.find((x) => x.code === code);
    if (!g || !address || g.id === 0n) return;
    await writeContractAsync({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "cancelGift", args: [g.id] });
    saveSentGift(address, { ...g, cancelled: true });
    void details.refetch();
  }

  return { gifts, cancel, cancelling: isPending, refetch: () => { void ids.refetch(); void details.refetch(); } };
}

/** Claim a live code for the connected wallet: look up the gift, sign with the code's key, send. */
export function useClaimGift() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<{ busy: boolean; error: string; done: { quantity: number; tier: number } | null }>({ busy: false, error: "", done: null });

  async function claim(secret: string) {
    if (!address || !client) return;
    setState({ busy: true, error: "", done: null });
    try {
      const account = giftAccount(normalizeCode(secret));
      const id = await client.readContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "giftIdOf", args: [account.address] });
      if (id === 0n) throw new Error("No gift has this code. Check it, or wait a minute if it was just bought.");
      const [, , tier, quantity, done] = await client.readContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "gifts", args: [id] });
      if (done) throw new Error("This gift has already been claimed or cancelled.");
      const message = await client.readContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "giftMessage", args: [id, address] });
      const signature: Hex = await account.signMessage({ message: { raw: message } });
      const hash = await writeContractAsync({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "claimGift", args: [id, signature] });
      // Only say it's yours once it's confirmed (a reverted claim would otherwise look done).
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (receipt.status !== "success") throw new Error("The claim didn't go through. Try again.");
      setState({ busy: false, error: "", done: { quantity: Number(quantity), tier: Number(tier) } });
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? "Couldn't claim this gift.";
      setState({ busy: false, error: msg, done: null });
    }
  }

  return { ...state, claim };
}
