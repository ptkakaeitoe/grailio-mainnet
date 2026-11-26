import { PACK_TIERS } from "@/lib/contracts";

/**
 * Risk budgets: how much of the pool deposit (USD) each risky tier may tie up.
 *
 * An unopened Medium/High pack reserves its top payout minus the price until
 * it's opened (then the reservation comes back, minus what the card holds).
 * CollectPacks has one shared pool; these budgets are enforced by the app so
 * one risk can't use it all. The contract's own capacity check stays the hard
 * limit. Low-risk tiers never reserve anything and aren't listed.
 *
 * $80 deposit: Fable High $28 (3 at once), Fable Medium $52 (17 at once).
 */
export const TIER_BUDGETS: Record<number, number> = {
  1: 52, // Fable Medium: $3.00 held per unopened pack
  2: 28, // Fable High: $9.13 held per unopened pack
};

/** Most packs of a budgeted tier one purchase can take. */
export const RISKY_MAX_PER_BUY = 3;

/** USD a single unopened pack of `tier` holds back (0 for Low risk). */
export function heldPerPack(tier: number): number {
  const t = PACK_TIERS[tier];
  if (!t) return 0;
  return Math.max(0, Math.max(...t.backing) - t.price);
}

/** How many packs of `tier` may be unopened at once under its budget (Infinity if unbudgeted). */
export function slotsFor(tier: number): number {
  const budget = TIER_BUDGETS[tier];
  const held = heldPerPack(tier);
  if (budget === undefined || held === 0) return Infinity;
  return Math.floor(budget / held + 1e-9);
}

/** Packs of `tier` still buyable now, given how many are unopened. */
export function packsLeft(tier: number, unopened: number): number {
  const slots = slotsFor(tier);
  return slots === Infinity ? Infinity : Math.max(0, slots - unopened);
}
