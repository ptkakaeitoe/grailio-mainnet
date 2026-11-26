"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { PACK_TIERS } from "@/lib/contracts";
// Demo mode uses the stock set.
import { DEMO_STOCK_CARDS as STOCK_CARDS } from "@/lib/cards";
import { basketForTier } from "@/lib/stock-assets";
import { newDemoCode } from "@/lib/gift-code";
import { readDemo, resetDemoStorage, serverDemo, subscribeDemo, writeDemo } from "@/lib/demo-store";
import { initialDemo, buyDemoPacks, openDemoPack, actOnDemoCard, pendingDemoReward, demoStakingNow, seedDemoListings, buyDemoListing, listDemoCard, cancelDemoListing, buyDemoGift, claimDemoGift, cancelDemoGift, type DemoCard, type DemoGift, type DemoCurrency, type DemoListing, type DemoState } from "@/lib/demo-economy";

export type DemoMarket = {
  listings: DemoListing[];
  /** Put other collectors' listings on the market once prices are known. */
  seed: (prices: Record<string, number>, avaxUsd: number) => void;
  buy: (listingId: number) => boolean;
  list: (cardId: number, price: number, currency: DemoCurrency, days: number) => boolean;
  cancel: (listingId: number) => boolean;
};

const DemoContext = createContext<{
  active: boolean; balances: Record<string, number>; packs: number[]; cards: DemoCard[]; /** Redeemed cards, shown on the profile. */ redeemed: DemoCard[];
  /** Start or resume demo mode (your demo wallet is kept in this browser). */
  start: () => void;
  /** Leave demo mode; the demo wallet stays saved for next time. */
  exit: () => void;
  /** Wipe the demo wallet, chat and DAO and start fresh. */
  reset: () => void;
  swap: (from: string, to: string, amount: number, received: number) => boolean;
  buyPacks: (tier: number, quantity: number, payment: string, price: number) => boolean;
  openPack: (prices: Record<string, number>) => DemoCard | null;
  market: DemoMarket;
  /** Collector points: 1 per pack bought. They vote in the DAO. */
  points: number;
  /** Gifts you bought in demo, newest first. */
  gifts: DemoGift[];
  /** Buy packs as a gift; returns the code to share, or null if it couldn't be paid. */
  buyGift: (tier: number, quantity: number, payment: string, price: number) => string | null;
  /** Claim a demo code's packs (once per browser). */
  claimGift: (code: string, tier: number, quantity: number) => boolean;
  cancelGift: (code: string) => boolean;
  cardAction: (id: number, action: 'stake' | 'claim' | 'unstake' | 'redeem') => boolean;
  /** Staking (7-day half-life pool): a card's unclaimed USDC, and the pool's payout now. */
  pending: (card: DemoCard, now: number) => number;
  stakingNow: (now: number) => ReturnType<typeof demoStakingNow>;
} | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  // Saved in localStorage (lib/demo-store), so demo survives reloads; the server render sees demo off.
  const { active, state } = useSyncExternalStore(subscribeDemo, readDemo, serverDemo);
  // Always the latest saved wallet, even between renders.
  const ledger = { get current() { return readDemo().state; } };
  function publish(next: DemoState) { writeDemo({ ...readDemo(), state: next }); }
  function setActive(on: boolean) { writeDemo({ ...readDemo(), active: on }); }
  function reset() { resetDemoStorage(); writeDemo({ active: readDemo().active, state: initialDemo() }); }
  function swap(from: string, to: string, amount: number, received: number) {
    if (!active || from === to || !Number.isFinite(amount) || !Number.isFinite(received) || amount <= 0 || received <= 0 || amount > (ledger.current.balances[from] ?? 0)) return false;
    publish({ ...ledger.current, balances: { ...ledger.current.balances, [from]: ledger.current.balances[from] - amount, [to]: (ledger.current.balances[to] ?? 0) + received } });
    return true;
  }
  function buyPacks(tierId: number, quantity: number, payment: string, price: number) {
    const tier = PACK_TIERS.find(t => t.id === tierId);
    if (!active || !tier) return false;
    const next = buyDemoPacks(ledger.current, tier, quantity, payment, price);
    if (!next) return false;
    publish(next); return true;
  }
  function openPack(prices: Record<string, number>) {
    const tier = PACK_TIERS.find(t => t.id === ledger.current.packs[0]);
    if (!active || !tier) return null;
    const next = openDemoPack(ledger.current, tier, basketForTier(tier.id), prices, Math.random(), Math.random(), Date.now());
    if (!next) return null;
    publish(next.state); return next.card;
  }
  function cardAction(id: number, action: 'stake' | 'claim' | 'unstake' | 'redeem') {
    if (!active) return false;
    const next = actOnDemoCard(ledger.current, id, action, Date.now());
    if (!next) return false;
    publish(next); return true;
  }
  /** Apply a pure market step; false when it was refused. */
  function step(next: DemoState | null) {
    if (!active || !next) return false;
    publish(next); return true;
  }
  const market: DemoMarket = {
    listings: state.listings,
    seed: (prices, avaxUsd) => { step(seedDemoListings(ledger.current, STOCK_CARDS.map(c => c.ticker), prices, avaxUsd, Math.random, Date.now())); },
    buy: (id) => step(buyDemoListing(ledger.current, id)),
    list: (cardId, price, currency, days) => step(listDemoCard(ledger.current, cardId, price, currency, days, Date.now())),
    cancel: (id) => step(cancelDemoListing(ledger.current, id)),
  };
  function buyGift(tierId: number, quantity: number, payment: string, price: number) {
    const tier = PACK_TIERS.find(t => t.id === tierId);
    if (!active || !tier) return null;
    const code = newDemoCode(tierId, quantity);
    return step(buyDemoGift(ledger.current, tier, quantity, payment, price, code, Date.now())) ? code : null;
  }
  return <DemoContext.Provider value={{ active, balances: state.balances, packs: state.packs, cards: state.cards, redeemed: state.redeemed ?? [], start: () => setActive(true), exit: () => setActive(false), reset, swap, buyPacks, openPack, cardAction, pending: (card, now) => pendingDemoReward(state, card, now), stakingNow: (now) => demoStakingNow(state, now), market, points: state.points ?? 0, gifts: state.gifts, buyGift, claimGift: (code, tier, quantity) => step(claimDemoGift(ledger.current, code, tier, quantity)), cancelGift: (code) => step(cancelDemoGift(ledger.current, code)) }}>{children}</DemoContext.Provider>;
}
export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("DemoProvider is missing");
  return value;
}
