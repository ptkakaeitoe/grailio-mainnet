"use client";

import { erc20Abi, formatEther, formatUnits, zeroAddress, type Address } from "viem";
import { useAccount, useBalance, useReadContracts } from "wagmi";

import { useDemo } from "@/components/demo-provider";
import { CARD_BY_TICKER, DEMO_STOCK_CARDS } from "@/lib/cards";
import { TOKENS as REAL_TOKENS } from "@/lib/tokens";
import { useStockPrices } from "@/lib/use-stock-prices";

/** The real BNB Chain tokens a wallet can hold here (BNB is read separately). Keyed by price ticker. */
const TOKENS = Object.entries(REAL_TOKENS)
  .filter(([, t]) => !t.native)
  .map(([key, t]) => ({ key, label: t.symbol, token: t.address, decimals: t.decimals, color: key === "USDC" ? "#2775ca" : key === "USDT" ? "#26a17b" : CARD_BY_TICKER[key]?.accent ?? "#888" }));

const AVAX_COLOR = "#f0b90b";

/** `key`: the TOKENS key (BNB, USDT, NVDA…), for sending. */
export type Holding = { key: string; label: string; color: string; value: number; price: number | null };

/**
 * BNB plus every token the wallet holds, priced in USD (USDC and USDT are $1, the rest
 * use live DEX prices). The connected wallet unless `account` is given. In
 * demo mode the connected view uses the simulated ledger instead of the chain;
 * another account's is always read live.
 */
export function useWalletHoldings(account?: Address) {
  const ledger = useDemo();
  const { address: connected } = useAccount();
  const address = account ?? connected;
  const demo = { active: !account && ledger.active, balances: ledger.balances };
  // Demo ledger: stock prices. A real wallet (yours or anyone else's): token prices.
  const { byTicker } = useStockPrices(60_000, demo.active ? "stocks" : "tokens");

  const query = { enabled: Boolean(address) && !demo.active, refetchInterval: 10_000 };
  const avax = useBalance({ address, query });
  const tokens = useReadContracts({
    allowFailure: true,
    contracts: TOKENS.map((t) => ({ address: t.token, abi: erc20Abi, functionName: "balanceOf" as const, args: [address ?? zeroAddress] as const })),
    query,
  });

  const avaxUsd = byTicker.WBNB?.price ?? null;
  const priceOf = (key: string) => (key === "USDC" || key === "USDT" ? 1 : byTicker[key]?.price ?? null);

  let loaded: boolean;
  let holdings: Holding[];
  if (demo.active) {
    loaded = true;
    holdings = [
      { key: "BNB", label: "BNB", color: AVAX_COLOR, value: demo.balances.BNB ?? 0, price: avaxUsd },
      ...[{ label: "USDT", color: "#26a17b", key: "USDT" }, ...DEMO_STOCK_CARDS.map((card) => ({ label: card.ticker, color: card.accent, key: card.ticker }))]
        .flatMap((t) => {
          const value = demo.balances[t.label] ?? 0;
          return value > 0 ? [{ key: t.key, label: t.label, color: t.color, value, price: priceOf(t.key) }] : [];
        }),
    ];
  } else {
    loaded = avax.data !== undefined && tokens.data !== undefined;
    holdings = loaded
      ? [
          { key: "BNB", label: "BNB", color: AVAX_COLOR, value: Number(formatEther(avax.data!.value)), price: avaxUsd },
          ...TOKENS.flatMap((t, i) => {
            const row = tokens.data![i];
            const raw = row?.status === "success" ? (row.result as bigint) : 0n;
            return raw > 0n ? [{ key: t.key, label: t.label, color: t.color, value: Number(formatUnits(raw, t.decimals)), price: priceOf(t.key) }] : [];
          }),
        ]
      : [];
  }
  const total = holdings.reduce((sum, h) => sum + (h.price === null ? 0 : h.value * h.price), 0);

  return { loaded, holdings, total, failed: !demo.active && (avax.isError || tokens.isError) };
}
