/** Wallet-filtered purchase history, independent of the global pack counter. */
export type Purchase = { id: bigint; blockNumber: bigint };
export type PurchaseHistory = { purchases: Purchase[]; through: bigint };

const BLOCK_PAGE = 2_000n;
const RECHECK_BLOCKS = 64n;

export async function discoverPurchases({ fromBlock, toBlock, previous, fetchPage, signal }: {
  fromBlock: bigint;
  toBlock: bigint;
  previous?: PurchaseHistory;
  fetchPage: (from: bigint, to: bigint) => Promise<Purchase[]>;
  signal?: AbortSignal;
}): Promise<PurchaseHistory> {
  // Re-read the recent tail to reconcile short reorganizations. A backwards
  // head invalidates the checkpoint and triggers a full scan.
  const usable = previous && previous.through <= toBlock ? previous : undefined;
  const tail = usable ? usable.through - RECHECK_BLOCKS + 1n : fromBlock;
  const start = tail > fromBlock ? tail : fromBlock;
  const found = new Map((usable?.purchases ?? []).filter((p) => p.blockNumber < start).map((p) => [p.id, p]));
  for (let from = start; from <= toBlock; from += BLOCK_PAGE) {
    signal?.throwIfAborted();
    const to = from + BLOCK_PAGE - 1n < toBlock ? from + BLOCK_PAGE - 1n : toBlock;
    for (const purchase of await fetchPage(from, to)) found.set(purchase.id, purchase);
  }
  signal?.throwIfAborted();
  // Publish a checkpoint only after every page succeeds.
  return { purchases: [...found.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), through: toBlock };
}
