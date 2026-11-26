"use client";

import { initialDemo, startDemoStaking, type DemoState } from "@/lib/demo-economy";

/**
 * Demo mode, saved in this browser (localStorage): whether it's on and the
 * simulated wallet (balances, packs, cards, market). Survives reloads and
 * exiting demo; "Reset demo" clears it. Other tabs stay in sync.
 */
export type DemoSnapshot = { active: boolean; state: DemoState };

const KEY = "collect-demo-v2";
/** Other demo data cleared together with the wallet on reset. */
export const DEMO_EXTRA_KEYS = ["collect-demo-chat-v1", "collect-demo-dao-v2"];

const SERVER: DemoSnapshot = { active: false, state: initialDemo() };
let cache: DemoSnapshot | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): DemoSnapshot {
  if (!raw) return { active: false, state: initialDemo() };
  const saved = JSON.parse(raw) as Partial<DemoSnapshot>;
  const base = initialDemo();
  const s = (saved.state ?? {}) as Partial<DemoState>;
  // Wallets saved before points existed: count what they already bought.
  const points = s.points ?? (s.packs?.length ?? 0) + (s.cards?.length ?? 0) + (s.gifts?.length ?? 0);
  // Merge onto a fresh wallet so data saved by an older version still loads.
  return {
    active: saved.active === true,
    // Saves from before the staking pool: start it now so staked cards keep earning.
    state: startDemoStaking({ ...base, ...s, balances: { ...base.balances, ...(s.balances ?? {}) }, packs: s.packs ?? [], cards: s.cards ?? [], listings: s.listings ?? [], gifts: s.gifts ?? [], claimed: s.claimed ?? [], points, redeemed: s.redeemed ?? [] }, Date.now()),
  };
}

export function readDemo(): DemoSnapshot {
  if (cache) return cache;
  try {
    cache = parse(localStorage.getItem(KEY));
  } catch {
    cache = { active: false, state: initialDemo() }; // blocked storage or bad data: start fresh
  }
  return cache;
}

export function writeDemo(next: DemoSnapshot) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: demo still works for this visit.
  }
  listeners.forEach((l) => l());
}

/** Clears the demo wallet and the other demo data (chat, DAO). */
export function resetDemoStorage() {
  try {
    DEMO_EXTRA_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export function subscribeDemo(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the demo: reload it here.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const serverDemo = () => SERVER;
