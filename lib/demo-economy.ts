/** Pure simulation rules. Values are approximate numbers, never on-chain funds. */
export type DemoTier = { id: number; price: number; odds: readonly number[]; backing: readonly number[] };
export type DemoCard = { id: number; ticker: string; tier: number; rarity: number; amount: number; stakedAt: number | null; /** Staking: the pool's acc when this card was last paid. */ debt?: number };
export type DemoState = { balances: Record<string, number>; packs: number[]; cards: DemoCard[]; nextId: number; listings: DemoListing[]; nextListingId: number; marketSeeded: boolean; gifts: DemoGift[]; claimed: string[]; points: number; /** Redeemed (burned) cards, kept for the profile. */ redeemed: DemoCard[]; /** Simulated CollectStaking pool; created on first use. */ staking?: DemoStaking };
export const initialDemo = (): DemoState => ({ balances: { BNB: 100, USDT: 5000, USDC: 5000, NVDA: 0, AAPL: 0, TSLA: 0, AMZN: 0 }, packs: [], cards: [], nextId: 1, listings: [], nextListingId: 1, marketSeeded: false, gifts: [], claimed: [], points: 0, redeemed: [] });
export function packCost(tier: DemoTier, quantity: number, price: number): number | null {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10 || !Number.isFinite(price) || price <= 0) return null;
  return tier.price * quantity / price;
}
export function buyDemoPacks(state: DemoState, tier: DemoTier, quantity: number, payment: string, price: number): DemoState | null {
  if (!['USDC', 'NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'WBNB', 'BTC', 'ETH', 'LINK', 'CAKE'].includes(payment)) return null;
  const cost = packCost(tier, quantity, payment === 'USDC' ? 1 : price);
  if (cost === null || (state.balances[payment] ?? 0) < cost) return null;
  const packs = [...state.packs, ...Array<number>(quantity).fill(tier.id)];
  // 1 collector point per pack bought, like mainnet (they vote in the DAO).
  return { ...state, packs, points: (state.points ?? 0) + quantity, balances: { ...state.balances, [payment]: state.balances[payment] - cost, PACK: packs.length } };
}
export function drawRarity(odds: readonly number[], random: number): number {
  if (!Number.isFinite(random) || random < 0 || random >= 1) throw new Error('Invalid random draw');
  let cumulative = 0;
  for (let i = 0; i < odds.length; i++) { cumulative += odds[i]; if (random * 100 < cumulative) return i; }
  throw new Error('Invalid rarity distribution');
}
export function openDemoPack(state: DemoState, tier: DemoTier, tickers: readonly string[], prices: Record<string, number>, stockDraw: number, rarityDraw: number, now?: number): { state: DemoState; card: DemoCard } | null {
  if (state.packs[0] !== tier.id || !Number.isFinite(stockDraw) || stockDraw < 0 || stockDraw >= 1) return null;
  // Require all quotes before drawing; missing quotes must not bias the stock selection.
  if (!tickers.length || tickers.some(t => !Number.isFinite(prices[t]) || prices[t] <= 0)) return null;
  const ticker = tickers[Math.floor(stockDraw * tickers.length)];
  const rarity = drawRarity(tier.odds, rarityDraw);
  const card: DemoCard = { id: state.nextId, ticker, tier: tier.id, rarity, amount: tier.backing[rarity] / prices[ticker], stakedAt: null };
  const packs = state.packs.slice(1);
  const opened = { ...state, packs, cards: [...state.cards, card], nextId: state.nextId + 1, balances: { ...state.balances, PACK: packs.length } };
  // A pack that pays out less than its price is revenue; part of it goes to stakers.
  return { card, state: now === undefined ? opened : addDemoRevenue(opened, tier.price - tier.backing[rarity], now) };
}
// ---- Staking (simulated CollectStaking) ----
/**
 * Same rules as contracts/src/CollectStaking.sol: one USDC pool pays out with a
 * 7-day half-life, split by rarity weight through a per-weight accumulator.
 * Demo has no other players, so it starts with a pool from "other packs" and
 * other stakers holding DEMO_OTHER_WEIGHT; your opened packs add revenue.
 */
export type DemoStaking = { pool: number; acc: number; last: number };
export const DEMO_HALF_LIFE = 7 * 86_400_000;
/** STAKE_WEIGHTS in lib/collect-packs.ts (kept here so these rules stay import-free). */
export const DEMO_STAKE_WEIGHTS = [1, 2, 4, 10] as const;
export const DEMO_STAKING_SEED = 500;
export const DEMO_OTHER_WEIGHT = 200;
/** Share of revenue sent to staking (STAKING_BPS default 5000). */
export const DEMO_STAKING_SHARE = 0.5;
/** Share of the pool left after dt ms: 2^(-dt / 7 days). */
export const keptAfter = (dt: number) => 2 ** (-Math.max(0, dt) / DEMO_HALF_LIFE);
const stakedWeight = (cards: DemoCard[]) => cards.reduce((w, c) => w + (c.stakedAt === null ? 0 : DEMO_STAKE_WEIGHTS[c.rarity]), 0);
/** The pool after paying out what decayed since its last update (the contract's _update). */
function settle(state: DemoState, now: number): DemoStaking {
  const s = state.staking ?? { pool: DEMO_STAKING_SEED, acc: 0, last: now };
  const released = s.pool * (1 - keptAfter(now - s.last));
  return { pool: s.pool - released, acc: s.acc + released / (DEMO_OTHER_WEIGHT + stakedWeight(state.cards)), last: Math.max(now, s.last) };
}
/** Settled pool, with any staked card that has no debt yet (older saves) starting from now. */
function syncStaking(state: DemoState, now: number): DemoState {
  const staking = settle(state, now);
  return { ...state, staking, cards: state.cards.map(c => c.stakedAt !== null && c.debt === undefined ? { ...c, debt: staking.acc } : c) };
}
/** Starts the pool for a save that has none (older saves): its staked cards earn from `now`. */
export const startDemoStaking = (state: DemoState, now: number): DemoState => (state.staking ? state : syncStaking(state, now));
/** USDC a staked card has earned and not claimed. */
export function pendingDemoReward(state: DemoState, card: DemoCard, now: number): number {
  if (card.stakedAt === null || card.debt === undefined || !state.staking) return 0;
  return DEMO_STAKE_WEIGHTS[card.rarity] * Math.max(0, settle(state, now).acc - card.debt);
}
/** The pool now, what it pays everyone over the next 24 hours, and your part of that. */
export function demoStakingNow(state: DemoState, now: number) {
  const { pool } = settle(state, now);
  const total = pool * (1 - keptAfter(86_400_000));
  const weight = stakedWeight(state.cards);
  const perWeight = total / (DEMO_OTHER_WEIGHT + weight);
  return { pool, total, yours: perWeight * weight, perWeight };
}
/** Pack profit (price minus card value) arrives in the pool via distribute(). */
function addDemoRevenue(state: DemoState, revenue: number, now: number): DemoState {
  if (!(revenue > 0)) return state;
  const s = syncStaking(state, now);
  return { ...s, staking: { ...s.staking!, pool: s.staking!.pool + revenue * DEMO_STAKING_SHARE } };
}
export function actOnDemoCard(state: DemoState, id: number, action: 'stake' | 'claim' | 'unstake' | 'redeem', now: number): DemoState | null {
  const card = state.cards.find(c => c.id === id);
  if (!card || !Number.isFinite(now)) return null;
  if (action === 'redeem') {
    if (card.stakedAt !== null) return null;
    const symbol = `${card.ticker}`;
    return { ...state, cards: state.cards.filter(c => c.id !== id), redeemed: [...(state.redeemed ?? []), card], balances: { ...state.balances, [symbol]: (state.balances[symbol] ?? 0) + card.amount } };
  }
  if ((action === 'stake') !== (card.stakedAt === null)) return null;
  // Settle with the weights as they were, then change this card (like the contract).
  const synced = syncStaking(state, now);
  const { acc } = synced.staking!;
  const current = synced.cards.find(c => c.id === id)!;
  const reward = action === 'stake' ? 0 : DEMO_STAKE_WEIGHTS[current.rarity] * Math.max(0, acc - (current.debt ?? acc));
  const next: DemoCard = action === 'unstake' ? { ...current, stakedAt: null, debt: undefined } : { ...current, stakedAt: action === 'stake' ? now : current.stakedAt, debt: acc };
  return { ...synced, balances: { ...synced.balances, USDC: synced.balances.USDC + reward }, cards: synced.cards.map(c => c.id === id ? next : c) };
}

// ---- Marketplace (simulated) ----
export type DemoCurrency = 'USDC' | 'BNB';
/** A listed card is held by the market (escrow) until it sells or is cancelled. */
export type DemoListing = { id: number; card: DemoCard; price: number; currency: DemoCurrency; seller: string; expiresAt: number };
export const DEMO_MARKET_FEE = 0.01;
/** Prices are kept at display precision: 4 decimals for BNB, cents for USDC. */
export const roundPrice = (price: number, currency: DemoCurrency) => { const f = currency === 'BNB' ? 1e4 : 1e2; return Math.round(price * f) / f; };
export const DEMO_SELLERS = ['@relicfox', '@bluechip_ben', '@tsla_maxi', '@seedvault', '@nightdesk'] as const;

/**
 * Other collectors' listings, priced around what each card holds (a mix of
 * USDC and BNB). Seeded once, when prices are known.
 */
export function seedDemoListings(state: DemoState, tickers: readonly string[], prices: Record<string, number>, avaxUsd: number, random: () => number, now: number): DemoState | null {
  if (state.marketSeeded) return null;
  if (!(avaxUsd > 0) || tickers.some(t => !(prices[t] > 0))) return null;
  const backing = [0.82, 1.4, 2.8, 10.13];
  const listings: DemoListing[] = [];
  let nextId = state.nextId;
  for (let i = 0; i < 8; i++) {
    const ticker = tickers[Math.floor(random() * tickers.length)];
    const rarity = drawRarity([50, 25, 20, 5], random());
    const card: DemoCard = { id: nextId++, ticker, tier: Math.floor(random() * 3), rarity, amount: backing[rarity] / prices[ticker], stakedAt: null };
    const usd = backing[rarity] * (0.9 + random() * 0.5);
    const currency: DemoCurrency = random() < 0.4 ? 'BNB' : 'USDC';
    listings.push({ id: i + 1, card, currency, price: roundPrice(currency === 'BNB' ? usd / avaxUsd : usd, currency), seller: DEMO_SELLERS[i % DEMO_SELLERS.length], expiresAt: now + (1 + Math.floor(random() * 7)) * 86_400_000 });
  }
  return { ...state, listings, nextListingId: listings.length + 1, nextId, marketSeeded: true };
}

export function buyDemoListing(state: DemoState, listingId: number): DemoState | null {
  const l = state.listings.find(x => x.id === listingId);
  if (!l || l.seller === 'you' || (state.balances[l.currency] ?? 0) < l.price) return null;
  return {
    ...state,
    listings: state.listings.filter(x => x.id !== listingId),
    cards: [...state.cards, { ...l.card, stakedAt: null, debt: undefined }],
    balances: { ...state.balances, [l.currency]: state.balances[l.currency] - l.price },
  };
}

export function listDemoCard(state: DemoState, cardId: number, price: number, currency: DemoCurrency, days: number, now: number): DemoState | null {
  const card = state.cards.find(c => c.id === cardId);
  price = Number.isFinite(price) ? roundPrice(price, currency) : NaN;
  if (!card || card.stakedAt !== null || !(price > 0) || !(days > 0)) return null;
  const listing: DemoListing = { id: state.nextListingId, card, price, currency, seller: 'you', expiresAt: now + days * 86_400_000 };
  return { ...state, cards: state.cards.filter(c => c.id !== cardId), listings: [...state.listings, listing], nextListingId: state.nextListingId + 1 };
}

export function cancelDemoListing(state: DemoState, listingId: number): DemoState | null {
  const l = state.listings.find(x => x.id === listingId);
  if (!l || l.seller !== 'you') return null;
  return { ...state, listings: state.listings.filter(x => x.id !== listingId), cards: [...state.cards, l.card] };
}

// ---- Gifts (simulated) ----
/** A gift you bought: its code, and whether it's still waiting to be claimed. */
export type DemoGift = { code: string; tier: number; quantity: number; status: 'open' | 'claimed' | 'cancelled'; createdAt: number };

/** Buy packs as a gift: paid like a normal purchase, held under `code` until claimed. */
export function buyDemoGift(state: DemoState, tier: DemoTier, quantity: number, payment: string, price: number, code: string, now: number): DemoState | null {
  const paid = buyDemoPacks({ ...state, packs: [] }, tier, quantity, payment, price);
  if (!paid) return null;
  const gift: DemoGift = { code, tier: tier.id, quantity, status: 'open', createdAt: now };
  return { ...state, points: paid.points, balances: { ...paid.balances, PACK: state.packs.length }, gifts: [gift, ...state.gifts] };
}

/** Claim a demo gift code once per browser. Your own open gift is marked claimed. */
export function claimDemoGift(state: DemoState, code: string, tier: number, quantity: number): DemoState | null {
  if (state.claimed.includes(code)) return null;
  const own = state.gifts.find(g => g.code === code);
  if (own && own.status !== 'open') return null;
  const packs = [...state.packs, ...Array<number>(quantity).fill(tier)];
  return {
    ...state,
    packs,
    claimed: [...state.claimed, code],
    gifts: state.gifts.map(g => (g.code === code ? { ...g, status: 'claimed' } : g)),
    balances: { ...state.balances, PACK: packs.length },
  };
}

/** Take back an open gift: its packs come to you. */
export function cancelDemoGift(state: DemoState, code: string): DemoState | null {
  const gift = state.gifts.find(g => g.code === code && g.status === 'open');
  if (!gift) return null;
  const packs = [...state.packs, ...Array<number>(gift.quantity).fill(gift.tier)];
  return { ...state, packs, gifts: state.gifts.map(g => (g.code === code ? { ...g, status: 'cancelled' } : g)), balances: { ...state.balances, PACK: packs.length } };
}
