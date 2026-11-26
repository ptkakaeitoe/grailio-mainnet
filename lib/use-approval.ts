"use client";

import { useEffect } from "react";
import { maxUint256, type Address } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { useToastedWrite } from "@/lib/toast";

import { erc20Abi, stockCardAbi } from "@/lib/contracts";
import { useWalletSync } from "@/lib/use-wallet-sync";

/**
 * Standard ERC20 approval for one spender. Contracts only pull payments with
 * an allowance, so an action button shows "Approve X" first when this is
 * short. Approves the maximum once, so later actions are one click. A token of
 * `null` (BNB) never needs approval.
 */
export function useApproval(token: Address | null, spender: Address, amount: bigint) {
  const { address } = useAccount();
  const { data: allowance, refetch } = useReadContract({
    address: token ?? undefined,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, spender] : undefined,
    query: { enabled: Boolean(address && token) },
  });
  const { writeContract, data: hash, isPending, error, reset } = useToastedWrite();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (receipt.isSuccess) void refetch();
  }, [receipt.isSuccess, refetch]);

  // The action right after an approval is where wallets reuse a stale nonce;
  // hold it until the wallet has caught up with the approval.
  const { syncing } = useWalletSync(receipt.isSuccess ? hash : undefined);
  const needsApproval = token !== null && (allowance === undefined || allowance < amount);
  return {
    needsApproval,
    /** False while the allowance hasn't loaded yet. */
    known: token === null || allowance !== undefined,
    approving: isPending || receipt.isLoading || syncing,
    /** An approval sent from this page just confirmed and is in effect (for a "done" cue). */
    justApproved: receipt.isSuccess && !syncing && !needsApproval,
    error,
    reset,
    approve: () => {
      if (!token) return;
      writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, maxUint256] });
    },
  };
}

/** `setApprovalForAll` on an NFT collection, for the non-custodial market. */
export function useNftApproval(nft: Address, operator: Address) {
  const { address } = useAccount();
  const { data: approved, refetch } = useReadContract({
    address: nft,
    abi: stockCardAbi,
    functionName: "isApprovedForAll",
    args: address ? [address, operator] : undefined,
    query: { enabled: Boolean(address) },
  });
  const { writeContract, data: hash, isPending, error } = useToastedWrite();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (receipt.isSuccess) void refetch();
  }, [receipt.isSuccess, refetch]);

  const { syncing } = useWalletSync(receipt.isSuccess ? hash : undefined);
  return {
    approved: approved === true,
    known: approved !== undefined,
    approving: isPending || receipt.isLoading || syncing,
    /** An approval sent from this page just confirmed and is in effect (for a "done" cue). */
    justApproved: receipt.isSuccess && !syncing && approved === true,
    error,
    approve: () => writeContract({ address: nft, abi: stockCardAbi, functionName: "setApprovalForAll", args: [operator, true] }),
  };
}
