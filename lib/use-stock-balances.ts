"use client";

import { formatEther } from "viem";
import { useAccount, useReadContracts } from "wagmi";

import { STOCK_CARDS } from "@/lib/cards";
import { stockTokenAbi, stockTokenFor } from "@/lib/contracts";

export type StockBalance = {
  ticker: string;
  symbol: string;
  balance: bigint;
  amount: number;
};

/** Reads the caller's balance of every deployed StockToken in one multicall. */
export function useStockBalances() {
  const { address } = useAccount();

  const entries = STOCK_CARDS.map((card) => ({
    ticker: card.ticker,
    address: stockTokenFor(card.ticker),
  })).filter((e): e is { ticker: string; address: `0x${string}` } => Boolean(e.address));

  const { data, refetch } = useReadContracts({
    allowFailure: true,
    contracts: entries.map((e) => ({
      address: e.address,
      abi: stockTokenAbi,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"] as const,
    })),
    query: { enabled: Boolean(address) && entries.length > 0, refetchInterval: 10_000 },
  });

  const balances: StockBalance[] = entries.map((e, i) => {
    const row = data?.[i];
    const balance = row?.status === "success" ? (row.result as bigint) : 0n;
    return {
      ticker: e.ticker,
      symbol: `${e.ticker}`,
      balance,
      amount: Number(formatEther(balance)),
    };
  });

  const byTicker = Object.fromEntries(balances.map((b) => [b.ticker, b]));
  const holdsAny = balances.some((b) => b.balance > 0n);

  return { balances, byTicker, holdsAny, connected: Boolean(address), refetch };
}
