import { zeroAddress, type Address } from "viem";
import { collectStakingAddress } from "@/lib/collect-packs";
import { PACK_TOKEN } from "@/lib/tokens";

/**
 * Grailio's fee on swaps (charged by KyberSwap inside the swap transaction).
 *
 * 0.5% of every swap. When USDT (the staking reward token, PACK_TOKEN) is on
 * either side the fee is taken in USDT and split: half straight to
 * CollectStaking (it counts any USDT it receives as staking revenue at its
 * next sync), half to the treasury wallet. Other swaps send the whole fee to
 * the treasury in the token paid, since CollectStaking only counts USDT and
 * anything else sent there is stuck.
 */
export const SWAP_FEE_BPS = 50;
/** Share of the fee that goes to stakers when it's in USDT. */
export const SWAP_FEE_STAKING_BPS = 25;
/** Receives the treasury share of every swap fee. */
export const SWAP_FEE_TREASURY: Address = "0x9c012Fd8571366DfF43F7D9f92A384e83208a524";

export type SwapFee = { feeAmount: string; chargeFeeBy: "currency_in" | "currency_out"; isInBps: true; feeReceiver: string };

const isRewardToken = (token: string) => token.toLowerCase() === PACK_TOKEN.address.toLowerCase();

/** The KyberSwap fee parameters for swapping `tokenIn` → `tokenOut`. */
export function swapFeeFor(tokenIn: string, tokenOut: string): SwapFee {
  const rewardSide = isRewardToken(tokenIn) ? "currency_in" : isRewardToken(tokenOut) ? "currency_out" : null;
  const staking = collectStakingAddress !== zeroAddress ? collectStakingAddress.toLowerCase() : null;
  const treasury = SWAP_FEE_TREASURY.toLowerCase();
  if (rewardSide && staking) {
    return { feeAmount: `${SWAP_FEE_STAKING_BPS},${SWAP_FEE_BPS - SWAP_FEE_STAKING_BPS}`, chargeFeeBy: rewardSide, isInBps: true, feeReceiver: `${staking},${treasury}` };
  }
  return { feeAmount: String(SWAP_FEE_BPS), chargeFeeBy: rewardSide ?? "currency_in", isInBps: true, feeReceiver: treasury };
}

/** True when a quoted route carries exactly the fee Grailio charges for its pair. */
export function hasCollectFee(route: { tokenIn: string; tokenOut: string; extraFee?: unknown }): boolean {
  const want = swapFeeFor(route.tokenIn, route.tokenOut);
  const got = route.extraFee as Partial<Record<keyof SwapFee, unknown>> | undefined;
  return Boolean(got)
    && String(got!.feeAmount) === want.feeAmount
    && got!.chargeFeeBy === want.chargeFeeBy
    && got!.isInBps === true
    && String(got!.feeReceiver).toLowerCase() === want.feeReceiver;
}
