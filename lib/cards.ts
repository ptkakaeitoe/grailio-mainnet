import { STOCK_ASSETS } from "./stock-assets.ts";

/** Card identities, one per tokenized stock. The artwork is framed by StockCardFront. */
export type StockCard = {
  slug: string;
  ticker: string;
  /** Relic name on the card. */
  name: string;
  /** Company or fund name ("Apple"). */
  tokenName: string;
  src: string;
  accent: string;
  number: string;
  /** Total in the series, shown after the number ("02 / 04"). Defaults to 05. */
  of?: string;
};

/** The five relic artworks; stock cards reuse them, cycling by asset ID. */
const RELICS = [
  { name: "Silver Seed", src: "/art/relics/aapl-silver-seed.png" },
  { name: "Prism Gate", src: "/art/relics/msft-prism-gate.png" },
  { name: "Neural Eye", src: "/art/relics/nvda-neural-eye.png" },
  { name: "Volt Crown", src: "/art/relics/tsla-volt-crown.png" },
  { name: "Wayfinder Key", src: "/art/relics/amzn-wayfinder-key.png" },
] as const;

/** One card per lib/stock-assets.ts entry (asset ID = index). */
export const STOCK_CARDS: StockCard[] = STOCK_ASSETS.map((stock, i) => {
  const relic = RELICS[stock.assetId % RELICS.length];
  return {
    slug: `${stock.ticker.toLowerCase()}-stock`,
    ticker: stock.ticker,
    name: relic.name,
    tokenName: stock.name,
    src: relic.src,
    accent: stock.accent,
    number: String(i + 1).padStart(2, "0"),
    of: String(STOCK_ASSETS.length).padStart(2, "0"),
  };
});

/** Demo mode uses the same stocks and baskets. */
export const DEMO_STOCK_CARDS: StockCard[] = STOCK_CARDS;

/** The card set for a mode (the same in both). */
export const cardsFor = (demo: boolean) => (demo ? DEMO_STOCK_CARDS : STOCK_CARDS);

const byKey = (cards: StockCard[], key: "slug" | "ticker") =>
  Object.fromEntries(cards.map((card) => [card[key], card])) as Record<string, StockCard>;

export const CARD_BY_SLUG = byKey(STOCK_CARDS, "slug");
export const CARD_BY_TICKER = byKey(STOCK_CARDS, "ticker");

/** Existing art retained for packs whose new artwork has not been created yet. */
const LEGACY_RARITY_ART = [
  { name: "Silver Seed", src: "/art/relics/aapl-silver-seed.png" },
  { name: "Neural Eye", src: "/art/relics/nvda-neural-eye.png" },
  { name: "Volt Crown", src: "/art/relics/tsla-volt-crown.png" },
  { name: "Wayfinder Key", src: "/art/relics/amzn-wayfinder-key.png" },
] as const;

/** Fable: Common, Rare, Epic, Legendary. The artwork contains no labels or frame. */
export const RARITY_ART = [
  { name: "Coal Worker", src: "/art/fable/coal-worker-wide-v2.png" },
  { name: "Flame Smith", src: "/art/fable/flame-smith-wide-v2.png" },
  { name: "Cinder Knight", src: "/art/fable/cinder-knight-wide-v2.png" },
  { name: "Ember King", src: "/art/fable/ember-king-wide-v2.png" },
] as const;

/** Saga: the retro nautical set, ordered Common through Legendary. */
export const SAGA_RARITY_ART = [
  { name: "Deckhand", src: "/art/saga/deckhand-v1.png" },
  { name: "Raider", src: "/art/saga/raider-v1.png" },
  { name: "Captain", src: "/art/saga/captain-v1.png" },
  { name: "Pirate Lord", src: "/art/saga/pirate-lord-v1.png" },
] as const;

/** Mythos: the etched creature set, ordered Common through Legendary. */
export const MYTHOS_RARITY_ART = [
  { name: "Imp", src: "/art/mythos/imp-v1.png" },
  { name: "Gargoyle", src: "/art/mythos/gargoyle-v1.png" },
  { name: "Wyrm", src: "/art/mythos/wyrm-v1.png" },
  { name: "Ancient Dragon", src: "/art/mythos/ancient-dragon-v1.png" },
] as const;

/** Art follows pack and rarity; the coin only sets its label, logo and stripe. */
export function cardArt(ticker: string, rarity: number, tier = 0): StockCard {
  const coin = CARD_BY_TICKER[ticker];
  // Tiers 0-2 Fable, 3-5 Saga, 6-8 Mythos.
  const set = tier >= 0 && tier <= 2 ? RARITY_ART
    : tier >= 3 && tier <= 5 ? SAGA_RARITY_ART
    : tier >= 6 && tier <= 8 ? MYTHOS_RARITY_ART : LEGACY_RARITY_ART;
  const art = set[rarity] ?? set[0];
  return {
    slug: `${coin?.slug ?? ticker.toLowerCase()}-r${rarity}`,
    ticker,
    tokenName: coin?.tokenName ?? ticker,
    name: art.name,
    src: art.src,
    accent: coin?.accent ?? "#888",
    number: String(rarity + 1).padStart(2, "0"),
    of: "04",
  };
}

/** The four possible Fable designs, independent of the randomly drawn coin. */
export const FABLE_CARDS = RARITY_ART.map((_, rarity) => cardArt("", rarity));

/** cardArt when the rarity is known; otherwise the coin's old artwork (e.g. a saved avatar with no rarity). */
export const artOf = (ticker: string, rarity?: number, tier?: number): StockCard | undefined =>
  rarity === undefined ? CARD_BY_TICKER[ticker] : CARD_BY_TICKER[ticker] || ticker ? cardArt(ticker, rarity, tier) : undefined;
