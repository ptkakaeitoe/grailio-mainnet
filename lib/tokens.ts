import type { Address } from "viem";

/**
 * Real BNB Smart Chain tokens the app prices and swaps, keyed by the symbol
 * the UI shows. Card tickers (lib/cards.ts) map onto these. BNB is the native
 * coin, which aggregators address with the 0xEeee… sentinel.
 *
 * Every address and decimals value was read on chain 56 on 2026-11-26. Note
 * that USDC on BNB Chain (Binance-Peg) has 18 decimals, not 6.
 */
export const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

export type TokenInfo = { symbol: string; address: Address; decimals: number; native?: true };

export const TOKENS: Record<string, TokenInfo> = {
  USDC: { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  BNB: { symbol: "BNB", address: NATIVE, decimals: 18, native: true },
  WBNB: { symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 },
  BTC: { symbol: "BTCB", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 },
  ETH: { symbol: "ETH", address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", decimals: 18 },
  LINK: { symbol: "LINK", address: "0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD", decimals: 18 },
  CAKE: { symbol: "CAKE", address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18 },
};

/** USDC decimals on this chain: every USD amount from the contracts uses it. */
export const USDC_DECIMALS = TOKENS.USDC.decimals;

export const tokenFor = (key: string): TokenInfo | undefined => TOKENS[key];

/** KyberSwap's MetaAggregationRouterV2 (same address on BNB Chain). Swaps may only be sent here. */
export const SWAP_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5" as Address;
