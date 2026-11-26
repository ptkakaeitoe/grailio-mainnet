"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { useAccount, useConnectorClient, usePublicClient } from "wagmi";

/** Give up waiting after this long and let the user try anyway. */
const MAX_WAIT_MS = 20_000;
const POLL_MS = 1_000;

/**
 * True from when `hash` is sent until the *wallet's own* RPC has caught up
 * with it. Wallets pick the next transaction's nonce from their node, and
 * The public RPC is load-balanced across nodes that lag each other: right
 * after a confirmation the wallet can still see the old count and reuse a
 * nonce ("nonce too low"). Two-step flows (approve → act, start opening →
 * open) keep the second button disabled while this is true.
 */
export function useWalletSync(hash: Hex | undefined) {
  const { address } = useAccount();
  const { data: wallet } = useConnectorClient();
  const client = usePublicClient();
  const [synced, setSynced] = useState<Hex | undefined>();

  useEffect(() => {
    if (!hash || !address || !wallet || !client) return;
    let cancelled = false;
    const wait = async () => {
      try {
        await client.waitForTransactionReceipt({ hash });
        const { nonce } = await client.getTransaction({ hash });
        const deadline = Date.now() + MAX_WAIT_MS;
        while (!cancelled && Date.now() < deadline) {
          // Asked through the wallet, so it's the count the wallet will use.
          const next = await wallet.request({ method: "eth_getTransactionCount", params: [address, "pending"] });
          if (Number(next) > nonce) break;
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      } catch {
        // Can't tell (e.g. the wallet refuses read calls): don't block the user.
      }
      if (!cancelled) setSynced(hash);
    };
    void wait();
    return () => { cancelled = true; };
  }, [hash, address, wallet, client]);

  return { syncing: Boolean(hash) && synced !== hash };
}
