import type { LimitStore } from "./relay-limits";

/**
 * Contract event logs straight from BSC RPCs (eth_getLogs, no API key), kept
 * in the shared store as an incremental index (server only). Pure: no app
 * imports, so tests can load it directly.
 *
 * Public RPCs cap getLogs ranges (publicnode: 10,000 blocks; bsc-dataseed
 * refuses getLogs), and BSC makes a block about every 0.45 s, so the history
 * is read in chunks, once: a cursor remembers the next block to scan, and each
 * log is pushed onto the capped lists it belongs to (a wallet's activity, a
 * chat room). A request scans at most a few chunks; if the index is behind it
 * serves what it has and the next request continues.
 */

/** A log as eth_getLogs returns it (hex strings). */
export type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  blockTimestamp?: string;
  transactionHash: string;
  logIndex: string;
  removed?: boolean;
};

/** What the index stores: the log plus its block time (hex seconds), as `timeStamp`. */
export type StoredLog = { address: string; topics: string[]; data: string; blockNumber: string; timeStamp: string; transactionHash: string; logIndex: string };

export type LogFilter = { address: string | string[]; topics?: (string | string[] | null)[] };

type RpcError = Error & { code?: number };

/** Errors that mean "ask for fewer blocks" (not "this endpoint is down"). */
export function isRangeError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  if (/beyond|head block/i.test(message)) return false; // a lagging node, not a range cap
  return /range|limit exceeded|too many|exceed|response size|results/i.test(message);
}

const hex = (n: bigint) => `0x${n.toString(16)}`;

/**
 * An eth_getLogs reader over several RPC endpoints. Each call starts at the
 * endpoint that last worked and moves on to the next on any error; when every
 * endpoint refuses the range, the chunk size halves (and stays smaller).
 */
export function logReader(urls: string[], { maxSpan = 10_000, minSpan = 50, fetcher = fetch }: { maxSpan?: number; minSpan?: number; fetcher?: typeof fetch } = {}) {
  const endpoints = [...new Set(urls.filter(Boolean))];
  let preferred = 0;
  let span = maxSpan;

  async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
    const res = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`RPC ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: { code?: number; message?: string } };
    if (body.error) throw Object.assign(new Error(body.error.message ?? "RPC error"), { code: body.error.code }) as RpcError;
    if (body.result === undefined) throw new Error("RPC: empty result");
    return body.result;
  }

  async function anyEndpoint<T>(method: string, params: unknown[]): Promise<T> {
    let last: unknown = new Error("No RPC endpoint");
    for (let i = 0; i < endpoints.length; i++) {
      const at = (preferred + i) % endpoints.length;
      try {
        const out = await rpc<T>(endpoints[at], method, params);
        preferred = at;
        return out;
      } catch (e) {
        last = e;
      }
    }
    throw last;
  }

  return {
    get span() {
      return span;
    },
    /** The chain's current block. */
    async head(): Promise<bigint> {
      return BigInt(await anyEndpoint<string>("eth_blockNumber", []));
    },
    /** Logs from `from` up to at most `to`, one chunk; `end` is the last block covered. */
    async chunk(filter: LogFilter, from: bigint, to: bigint): Promise<{ logs: RpcLog[]; end: bigint }> {
      for (;;) {
        const end = from + BigInt(span) - 1n < to ? from + BigInt(span) - 1n : to;
        try {
          const logs = await anyEndpoint<RpcLog[]>("eth_getLogs", [{ ...filter, fromBlock: hex(from), toBlock: hex(end) }]);
          return { logs: logs.filter((l) => !l.removed), end };
        } catch (e) {
          if (!isRangeError(e) || span <= minSpan) throw e;
          span = Math.max(minSpan, Math.floor(span / 2));
        }
      }
    },
    /** Block times (hex seconds) for logs whose RPC didn't include `blockTimestamp`. */
    async withTimes(logs: RpcLog[]): Promise<StoredLog[]> {
      const missing = [...new Set(logs.filter((l) => !l.blockTimestamp).map((l) => l.blockNumber))];
      const times = new Map<string, string>();
      for (const block of missing) {
        const b = await anyEndpoint<{ timestamp: string } | null>("eth_getBlockByNumber", [block, false]);
        times.set(block, b?.timestamp ?? "0x0");
      }
      return logs.map((l) => ({
        address: l.address.toLowerCase(),
        topics: l.topics,
        data: l.data,
        blockNumber: l.blockNumber,
        timeStamp: l.blockTimestamp ?? times.get(l.blockNumber) ?? "0x0",
        transactionHash: l.transactionHash,
        logIndex: l.logIndex,
      }));
    },
  };
}

export type LogReader = ReturnType<typeof logReader>;

export type IndexConfig = {
  store: LimitStore;
  reader: LogReader;
  /** Key prefix for this index (cursor, lock, lists). */
  ns: string;
  filter: LogFilter;
  /** First block to scan (the contracts' deploy block). */
  startBlock: bigint;
  /** The lists (key suffix + cap) a log belongs to; [] to skip it. */
  route: (log: StoredLog) => { list: string; max: number }[];
  maxChunks?: number;
  budgetMs?: number;
  /** Blocks behind the head left for the next scan (reorg margin). */
  confirmations?: number;
  /** Skip syncing if another request synced this recently. */
  minIntervalMs?: number;
};

export type SyncResult = { synced: boolean; cursor: bigint; head?: bigint; behind?: boolean; error?: string };

const cursorKey = (ns: string) => `${ns}:cursor`;
export const listKey = (ns: string, list: string) => `${ns}:l:${list}`;

/** The next block the index will scan. */
export async function indexCursor(store: LimitStore, ns: string, startBlock: bigint): Promise<bigint> {
  const raw = await store.get(cursorKey(ns));
  return raw ? BigInt(raw) : startBlock;
}

/**
 * Brings the index closer to the chain head. One request at a time holds the
 * lock (others skip and serve what's stored); the cursor only moves after a
 * chunk's logs are written, and readers drop duplicates by tx + log index, so
 * a crash between the two can't lose or double events. Never throws.
 */
export async function syncIndex(cfg: IndexConfig): Promise<SyncResult> {
  const { store, reader, ns, filter, startBlock, route, maxChunks = 8, budgetMs = 6_000, confirmations = 3, minIntervalMs = 2_000 } = cfg;
  let cursor = startBlock;
  try {
    cursor = await indexCursor(store, ns, startBlock);
    if (minIntervalMs > 0 && !(await store.lock(`${ns}:fresh`, "1", minIntervalMs))) return { synced: false, cursor };
    const owner = crypto.randomUUID();
    if (!(await store.lock(`${ns}:lock`, owner, budgetMs + 15_000))) return { synced: false, cursor };
    try {
      cursor = await indexCursor(store, ns, startBlock); // re-read under the lock
      const head = (await reader.head()) - BigInt(confirmations);
      const deadline = Date.now() + budgetMs;
      for (let n = 0; n < maxChunks && cursor <= head && Date.now() < deadline; n++) {
        const { logs, end } = await reader.chunk(filter, cursor, head);
        const stored = await reader.withTimes(logs);
        stored.sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || Number(a.logIndex) - Number(b.logIndex));
        const lists = new Map<string, { key: string; values: string[]; max: number }>();
        for (const log of stored) {
          for (const { list, max } of route(log)) {
            const key = listKey(ns, list);
            const entry = lists.get(key) ?? { key, values: [], max };
            entry.values.push(JSON.stringify(log));
            lists.set(key, entry);
          }
        }
        await store.pushMany([...lists.values()]);
        cursor = end + 1n;
        await store.set(cursorKey(ns), cursor.toString());
      }
      return { synced: true, cursor, head, behind: cursor <= head };
    } finally {
      await store.unlock(`${ns}:lock`, owner).catch(() => {});
    }
  } catch (e) {
    return { synced: false, cursor, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A list's logs, newest first, without duplicates. */
export async function readList(store: LimitStore, ns: string, list: string, max: number): Promise<StoredLog[]> {
  const seen = new Set<string>();
  const out: StoredLog[] = [];
  for (const raw of await store.list(listKey(ns, list), max)) {
    try {
      const log = JSON.parse(raw) as StoredLog;
      const id = `${log.transactionHash}:${Number(log.logIndex)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(log);
    } catch {
      // skip a corrupt entry
    }
  }
  return out;
}
