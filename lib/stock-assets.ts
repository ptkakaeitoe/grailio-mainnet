import type { Address } from "viem";

/**
 * Tokenized stocks (bStocks) that cards can hold: the one place to add one.
 *
 * Each entry is a CollectPacks asset ID. IDs 0-4 are the original BNB Chain
 * tokens (BTC, ETH, WBNB, LINK, CAKE, see lib/collect-packs.ts) and keep
 * rendering for existing cards; stocks start at 5. To add a stock, add one
 * line here (plus the asset on the pack contract with the same ID). Card art,
 * the card label and logo, token info, Atlas prices and the market all read
 * from this list.
 *
 * - atlasFeedId: Atlas Oracle feed, read on-chain from the MultiFeed
 *   (lib/atlas.ts). Feed IDs from https://atlasoracle.io/feeds.
 * - logo: defaults to /logos/{TICKER}B.png (public/logos, from bStocks' list).
 */
export type StockAsset = {
  assetId: number;
  /** Plain ticker shown on cards, e.g. "NVDA". */
  ticker: string;
  /** Company name, e.g. "NVIDIA". */
  name: string;
  address: Address;
  decimals: number;
  atlasFeedId: number;
  accent: string;
  logo?: string;
};

export const STOCK_ASSETS: StockAsset[] = [
  // Asset IDs follow the order in contracts/script/stocks.mainnet.json (AddStocks adds them as 5, 6, 7…).
  // Picked 2026-11-26: bStocks with a deep PancakeSwap v3 USDT pool, under ~2% cost on a $10k buy.
  { assetId: 5, ticker: "QQQ", name: "Invesco QQQ Trust", address: "0x205812CdBed920aFf76C6580abD681a46D11efc7", decimals: 18, atlasFeedId: 947, accent: "hsl(230 55% 45%)" },
  { assetId: 6, ticker: "BABA", name: "Alibaba", address: "0x4eF9d3062c7F6ebA4AAE4990c5036598C6eff4ec", decimals: 18, atlasFeedId: 962, accent: "hsl(138 55% 45%)" },
  { assetId: 7, ticker: "AAPL", name: "Apple", address: "0x431a3BEE82E2ca41e49895CbECE5bB0F76A89b7A", decimals: 18, atlasFeedId: 979, accent: "#868e96" },
  { assetId: 8, ticker: "TSLA", name: "Tesla", address: "0x5b1910eAaD6450E50f816082Aa078C41F10C292f", decimals: 18, atlasFeedId: 933, accent: "#e03131" },
  { assetId: 9, ticker: "NVDA", name: "NVIDIA", address: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436", decimals: 18, atlasFeedId: 934, accent: "#74b816" },
  { assetId: 10, ticker: "SPCX", name: "SpaceX", address: "0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1", decimals: 18, atlasFeedId: 938, accent: "#212529" },
  { assetId: 11, ticker: "ANT", name: "Anthropic", address: "0x38Dd26788Cf2d901E3aBf04efE3007d459d0Fc53", decimals: 18, atlasFeedId: 1169, accent: "hsl(28 55% 45%)" },
  { assetId: 12, ticker: "EWJ", name: "iShares MSCI Japan ETF", address: "0x26E32dAb9F844d7256Db4195b3a43750272A51E9", decimals: 18, atlasFeedId: 1163, accent: "hsl(337 55% 45%)" },
  { assetId: 13, ticker: "GOOGL", name: "Alphabet", address: "0x3F53De71c126BdaBAe20f9cD64848d317f6C3238", decimals: 18, atlasFeedId: 952, accent: "#f59f00" },
  { assetId: 14, ticker: "EWT", name: "iShares MSCI Taiwan ETF", address: "0x24824404bB9577697D11A07a5d88341191dE6578", decimals: 18, atlasFeedId: 1164, accent: "hsl(334 55% 45%)" },
  { assetId: 15, ticker: "SPY", name: "SPDR S&P 500 ETF", address: "0x7138b48df7D98D7e3cc221BfE7192D0a178182D8", decimals: 18, atlasFeedId: 956, accent: "#495057" },
  { assetId: 16, ticker: "EWY", name: "iShares MSCI South Korea ETF", address: "0xBE82F76637DBA2C114C41Df856c2C51e522E2Cb8", decimals: 18, atlasFeedId: 941, accent: "hsl(66 55% 45%)" },
  { assetId: 17, ticker: "SKHY", name: "SK Hynix", address: "0xCA750eF65f295BBECd685Abf54e82CAf297BDB61", decimals: 18, atlasFeedId: 958, accent: "hsl(245 55% 45%)" },
  { assetId: 18, ticker: "AMZN", name: "Amazon", address: "0x1a4b499833A79A09ad7Cf1D42D7DacF71e92eb00", decimals: 18, atlasFeedId: 981, accent: "hsl(196 55% 45%)" },
];

export const STOCK_BY_TICKER: Record<string, StockAsset> = Object.fromEntries(STOCK_ASSETS.map((s) => [s.ticker, s]));
export const STOCK_BY_ASSET: Record<number, StockAsset> = Object.fromEntries(STOCK_ASSETS.map((s) => [s.assetId, s]));

export const isStock = (ticker: string) => ticker in STOCK_BY_TICKER;

export const stockLogo = (ticker: string): string | undefined => {
  const stock = STOCK_BY_TICKER[ticker];
  return stock ? stock.logo ?? `/logos/${stock.ticker}B.png` : undefined;
};
