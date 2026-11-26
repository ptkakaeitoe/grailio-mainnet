import { bsc } from "viem/chains";

/**
 * Grailio runs on BNB Smart Chain mainnet (chain 56), in beta. Every chain
 * reference in the app goes through this module, so switching networks is a
 * one-file change.
 */
export const appChain = bsc;

/** Public RPC is rate-limited; set NEXT_PUBLIC_BSC_RPC_URL for production. */
export const rpcUrl =
  process.env.NEXT_PUBLIC_BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org";

export const explorerUrl = "https://bscscan.com";

/** Shown in the header and footer while the app is in beta. */
export const BETA = true;
