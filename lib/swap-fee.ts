import { zeroAddress, type Address } from "viem";
import { collectStakingAddress } from "@/lib/collect-packs";
import { TOKENS } from "@/lib/tokens";

/**
 * Grailio's fee on swaps (charged by KyberSwap inside the swap transaction).
 *
 * 0.5% of every swap. When USDC is on either side the fee is taken in USDC and
 * split: half straight to CollectStaking (it counts any USDC it receives as
 * staking revenue at its next sync), half to the treasury wallet. Swaps
 * without USDC send the whole fee to the treasury in the token paid, since
 * CollectStaking only counts USDC and anything else sent there is stuck.
 */
export const SWAP_FEE_BPS = 50;
/** Share of the fee that goes to stakers when it's in USDC. */
export const SWAP_FEE_STAKING_BPS = 25;
/** Receives the treasury share of every swap fee. */
export const SWAP_FEE_TREASURY: Address = "0x9c012Fd8571366DfF43F7D9f92A384e83208a524";

export type SwapFee = { feeAmount: string; chargeFeeBy: "currency_in" | "currency_out"; isInBps: true; feeReceiver: string };

const isUsdc = (token: string) => token.toLowerCase() === TOKENS.USDC.address.toLowerCase();

/** The KyberSwap fee parameters for swapping `tokenIn` → `tokenOut`. */
export function swapFeeFor(tokenIn: string, tokenOut: string): SwapFee {
  const usdcSide = isUsdc(tokenIn) ? "currency_in" : isUsdc(tokenOut) ? "currency_out" : null;
  const staking = collectStakingAddress !== zeroAddress ? collectStakingAddress.toLowerCase() : null;
  const treasury = SWAP_FEE_TREASURY.toLowerCase();
  if (usdcSide && staking) {
    return { feeAmount: `${SWAP_FEE_STAKING_BPS},${SWAP_FEE_BPS - SWAP_FEE_STAKING_BPS}`, chargeFeeBy: usdcSide, isInBps: true, feeReceiver: `${staking},${treasury}` };
  }
  return { feeAmount: String(SWAP_FEE_BPS), chargeFeeBy: usdcSide ?? "currency_in", isInBps: true, feeReceiver: treasury };
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
