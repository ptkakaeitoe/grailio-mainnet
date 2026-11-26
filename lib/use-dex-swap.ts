"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useReadContracts, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";

import type { RouteSummary } from "@/lib/kyber";
import { SWAP_ROUTER, TOKENS, tokenFor } from "@/lib/tokens";
import { useApproval } from "@/lib/use-approval";
import { useWalletSync } from "@/lib/use-wallet-sync";

const ERC20_KEYS = Object.keys(TOKENS).filter((key) => !TOKENS[key].native);

/** Wallet balances of every swappable token, raw and as numbers. */
export function useDexBalances(enabled: boolean) {
  const { address } = useAccount();
  const native = useBalance({ address, query: { enabled: enabled && Boolean(address), refetchInterval: 15_000 } });
  const erc20 = useReadContracts({
    allowFailure: true,
    contracts: ERC20_KEYS.map((key) => ({
      address: TOKENS[key].address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"] as const,
    })),
    query: { enabled: enabled && Boolean(address), refetchInterval: 15_000 },
  });

  const raw = (key: string): bigint => {
    if (key === "BNB") return native.data?.value ?? 0n;
    const index = ERC20_KEYS.indexOf(key);
    const row = erc20.data?.[index];
    return row?.status === "success" ? (row.result as bigint) : 0n;
  };
  const amount = (key: string) => {
    const token = tokenFor(key);
    return token ? Number(formatUnits(raw(key), token.decimals)) : 0;
  };
  return {
    raw,
    amount,
    refetch: () => { void native.refetch(); void erc20.refetch(); },
  };
}

/** Typed amount → smallest units of `key`, or 0n when invalid. */
export function toUnits(amount: string, key: string): bigint {
  const token = tokenFor(key);
  if (!token) return 0n;
  try {
    const value = parseUnits(amount.trim() || "0", token.decimals);
    return value > 0n ? value : 0n;
  } catch {
    return 0n; // too many decimals or not a number
  }
}

/**
 * A real swap through the aggregator: quote, approve (ERC20 only), then the
 * wallet signs a transaction to SWAP_ROUTER. The server only builds calldata.
 */
export function useDexSwap({ from, to, amountIn, slippagePct, enabled }: {
  from: string;
  to: string;
  amountIn: bigint;
  slippagePct: string;
  enabled: boolean;
}) {
  const { address } = useAccount();
  const fromToken = tokenFor(from);
  const toToken = tokenFor(to);

  // Quote once typing pauses, not on every keystroke.
  const [debounced, setDebounced] = useState(amountIn);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(amountIn), 400);
    return () => clearTimeout(id);
  }, [amountIn]);

  const quoteEnabled = enabled && Boolean(fromToken && toToken) && debounced > 0n && debounced === amountIn;
  const quote = useQuery({
    queryKey: ["dex-quote", from, to, debounced.toString()],
    enabled: quoteEnabled,
    refetchInterval: 20_000,
    retry: 1,
    queryFn: async () => {
      const res = await fetch(`/api/swap/quote?from=${from}&to=${to}&amount=${debounced}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Quote unavailable");
      return json.routeSummary as RouteSummary;
    },
  });

  const route = quoteEnabled ? quote.data : undefined;
  const amountOut = route && toToken ? Number(formatUnits(BigInt(route.amountOut), toToken.decimals)) : null;

  const approval = useApproval(enabled && fromToken && !fromToken.native ? fromToken.address : null, SWAP_ROUTER, amountIn);

  const { sendTransaction, data: hash, isPending, error: sendError, reset: resetSend } = useSendTransaction();
  const receipt = useWaitForTransactionReceipt({ hash });
  const { syncing } = useWalletSync(receipt.isSuccess ? hash : undefined);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  async function swap(onSent?: () => void) {
    if (!route || !address) return;
    if (approval.needsApproval) {
      approval.approve();
      return;
    }
    setBuildError(null);
    resetSend();
    setBuilding(true);
    try {
      const slippageBps = Math.round(Number.parseFloat(slippagePct) * 100);
      const res = await fetch("/api/swap/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeSummary: route, sender: address, slippageBps }),
      });
      const tx = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(tx.error ?? "Couldn't build the swap");
      // Defence in depth: never sign anything not addressed to the router.
      if (String(tx.to).toLowerCase() !== SWAP_ROUTER.toLowerCase()) throw new Error("Unexpected swap target");
      sendTransaction(
        { to: SWAP_ROUTER, data: tx.data, value: BigInt(tx.value ?? "0") },
        { onSuccess: () => onSent?.() },
      );
    } catch (error) {
      setBuildError(error instanceof Error ? error.message : "Couldn't build the swap");
    } finally {
      setBuilding(false);
    }
  }

  return {
    route,
    amountOut,
    gasUsd: route?.gasUsd ? Number(route.gasUsd) : null,
    quoting: quoteEnabled ? quote.isFetching && !quote.data : amountIn > 0n && enabled,
    quoteError: quoteEnabled && quote.error ? (quote.error as Error).message : null,
    approval,
    swap,
    hash,
    confirmed: receipt.isSuccess,
    reverted: receipt.data?.status === "reverted",
    busy: building || isPending || receipt.isLoading || syncing,
    error: buildError ?? (sendError ? sendError.message.split("\n")[0] : null),
    reset: () => { resetSend(); setBuildError(null); },
  };
}
