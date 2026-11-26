"use client";

import { useSyncExternalStore } from "react";

/**
 * Swaps made from this browser, newest first, per wallet ("demo" for demo
 * mode), so the Trade page can list recent trades with their status. Kept in
 * localStorage: it's a convenience list, the chain is the record.
 */
export type SwapStatus = "pending" | "confirmed" | "failed";
export type RecentSwap = { id: string; paid: string; received: string; time: number; status: SwapStatus; hash?: `0x${string}` };

const MAX = 20;
const keyOf = (owner: string) => `collect-swaps-v1:${owner.toLowerCase()}`;
const listeners = new Set<() => void>();
const cache = new Map<string, RecentSwap[]>();
const EMPTY: RecentSwap[] = [];

function read(owner: string): RecentSwap[] {
  const key = keyOf(owner);
  if (cache.has(key)) return cache.get(key)!;
  let list: RecentSwap[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) list = (JSON.parse(raw) as RecentSwap[]).filter((s) => s && typeof s.id === "string");
  } catch {
    // Blocked storage or bad data: start empty.
  }
  cache.set(key, list);
  return list;
}

function write(owner: string, list: RecentSwap[]) {
  const key = keyOf(owner);
  const next = list.slice(0, MAX);
  cache.set(key, next);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage blocked: the list still works for this visit.
  }
  listeners.forEach((l) => l());
}

/** Add a swap (or replace the one with the same id). */
export function saveSwap(owner: string, swap: RecentSwap) {
  write(owner, [swap, ...read(owner).filter((s) => s.id !== swap.id)]);
}

/** Change a saved swap's status (and hash), found by id or hash. */
export function updateSwap(owner: string, match: { id?: string; hash?: string }, patch: Partial<RecentSwap>) {
  const list = read(owner);
  if (!list.some((s) => (match.id && s.id === match.id) || (match.hash && s.hash === match.hash))) return;
  write(owner, list.map((s) => ((match.id && s.id === match.id) || (match.hash && s.hash === match.hash) ? { ...s, ...patch } : s)));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (!e.key?.startsWith("collect-swaps-v1:")) return;
    cache.delete(e.key);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** This wallet's recent swaps (empty until the browser has loaded). */
export function useRecentSwaps(owner: string | null | undefined): RecentSwap[] {
  return useSyncExternalStore(subscribe, () => (owner ? read(owner) : EMPTY), () => EMPTY);
}
