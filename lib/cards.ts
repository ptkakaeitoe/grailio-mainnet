import { STOCK_ASSETS } from "./stock-assets.ts";

/**
 * Shared card identities. Each relic (art + slot) has two identities: the live
 * app's BNB Chain token, and the demo's stock. The artwork is framed by
 * StockCardFront.
 */
export type StockCard = {
  slug: string;
  ticker: string;
  /** Relic name on the card. */
  name: string;
  /** What it tracks: the token ("Bitcoin") or, in the demo, the company ("Apple"). */
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

/** Original BNB Chain token cards (asset IDs 0-4), kept so existing cards still render. */
const TOKEN_CARDS: StockCard[] = [
  { slug: "btc-seed", ticker: "BTC", name: "Silver Seed", tokenName: "Bitcoin", src: "/art/relics/aapl-silver-seed.png", accent: "#f7931a", number: "01" },
  { slug: "eth-prism", ticker: "ETH", name: "Prism Gate", tokenName: "Ethereum", src: "/art/relics/msft-prism-gate.png", accent: "#627eea", number: "02" },
  { slug: "avax-eye", ticker: "WBNB", name: "Neural Eye", tokenName: "BNB", src: "/art/relics/nvda-neural-eye.png", accent: "#f0b90b", number: "03" },
  { slug: "link-crown", ticker: "LINK", name: "Volt Crown", tokenName: "Chainlink", src: "/art/relics/tsla-volt-crown.png", accent: "#2a5ada", number: "04" },
  { slug: "joe-key", ticker: "CAKE", name: "Wayfinder Key", tokenName: "PancakeSwap", src: "/art/relics/amzn-wayfinder-key.png", accent: "#1fc7d4", number: "05" },
];

/** Tokenized stock cards (asset IDs 5+), one per lib/stock-assets.ts entry. */
const STOCK_ASSET_CARDS: StockCard[] = STOCK_ASSETS.map((stock, i) => {
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

/** Live app: cards hold BNB Chain tokens (the original five) and tokenized stocks. */
export const STOCK_CARDS: StockCard[] = [...TOKEN_CARDS, ...STOCK_ASSET_CARDS];

/** Demo mode: the same relics, tracking stocks (prices from Yahoo Finance). */
export const DEMO_STOCK_CARDS: StockCard[] = [
  { slug: "btc-seed", ticker: "AAPL", name: "Silver Seed", tokenName: "Apple", src: "/art/relics/aapl-silver-seed.png", accent: "#7ba7c7", number: "01" },
  { slug: "eth-prism", ticker: "MSFT", name: "Prism Gate", tokenName: "Microsoft", src: "/art/relics/msft-prism-gate.png", accent: "#c9a227", number: "02" },
  { slug: "avax-eye", ticker: "NVDA", name: "Neural Eye", tokenName: "NVIDIA", src: "/art/relics/nvda-neural-eye.png", accent: "#76b900", number: "03" },
  { slug: "link-crown", ticker: "TSLA", name: "Volt Crown", tokenName: "Tesla", src: "/art/relics/tsla-volt-crown.png", accent: "#cc3b3b", number: "04" },
  { slug: "joe-key", ticker: "AMZN", name: "Wayfinder Key", tokenName: "Amazon", src: "/art/relics/amzn-wayfinder-key.png", accent: "#d99b45", number: "05" },
];

/** The card set for a mode: stocks in the demo, tokens otherwise. */
export const cardsFor = (demo: boolean) => (demo ? DEMO_STOCK_CARDS : STOCK_CARDS);

const byKey = (cards: StockCard[], key: "slug" | "ticker") =>
  Object.fromEntries(cards.map((card) => [card[key], card])) as Record<string, StockCard>;

export const CARD_BY_SLUG = byKey(STOCK_CARDS, "slug");
/** Looks up both sets. A live stock that shares a demo ticker (NVDA, AAPL) wins: same company either way. */
export const CARD_BY_TICKER = { ...byKey(DEMO_STOCK_CARDS, "ticker"), ...byKey(STOCK_CARDS, "ticker") };

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
  const set = tier === 0 || tier === 1 || tier === 2
    ? RARITY_ART
    : [3, 4, 6, 7].includes(tier) ? SAGA_RARITY_ART
    : [5, 8, 9].includes(tier) ? MYTHOS_RARITY_ART : LEGACY_RARITY_ART;
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
