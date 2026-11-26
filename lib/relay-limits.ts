/**
 * Shared limits and send lock for the chat gas relay (server only).
 *
 * Every relayed transaction costs the relayer real BNB, and serverless hosts
 * run many short-lived instances, so counters and the "one transaction at a
 * time" lock must live in a shared store, not in memory. This talks to Redis
 * over the Upstash REST API (Upstash, or Vercel KV which speaks the same API),
 * so no client library is needed:
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *   (or KV_REST_API_URL / KV_REST_API_TOKEN)
 * Without one, production refuses to relay; RELAY_ALLOW_MEMORY_LIMITS=1 allows
 * per-instance memory for local testing only.
 */

export type LimitStore = {
  /** INCR each key (setting its TTL in seconds on first use); returns the new values. */
  incr(keys: [key: string, ttlSeconds: number][]): Promise<number[]>;
  /** SET key value NX PX ttl. True if taken. */
  lock(key: string, value: string, ttlMs: number): Promise<boolean>;
  /** Deletes key only if it still holds value. */
  unlock(key: string, value: string): Promise<void>;
  /** The value a lock holds, or null. */
  holder(key: string): Promise<string | null>;
  /** Push to the front of a capped list and refresh its TTL (seconds). */
  push(key: string, value: string, max: number, ttl: number): Promise<void>;
  /** Up to `max` items from the front of a list, newest first. */
  list(key: string, max: number): Promise<string[]>;
  /** GET key. */
  get(key: string): Promise<string | null>;
  /** SET key value (no expiry). */
  set(key: string, value: string): Promise<void>;
  /** For each list: push the values in order (the last ends up in front), cap to `max`. No expiry. One round trip. */
  pushMany(lists: { key: string; values: string[]; max: number }[]): Promise<void>;
};

export type Limits = { perMinute: number; perDay: number; dailyTotal: number };

const today = (now: number) => new Date(now).toISOString().slice(0, 10);

/**
 * Checks and records one relayed request for `account`. Returns a reason to
 * refuse, or null. Each counter only grows once the checks before it pass: a
 * request refused for going too fast doesn't use up the day, and the shared
 * daily total only counts requests within their wallet's limits, so one
 * wallet's spam can't pause posting for everyone.
 */
export async function checkLimits(store: LimitStore, account: string, limits: Limits, now = Date.now()): Promise<string | null> {
  const minute = Math.floor(now / 60_000);
  const [perMinute] = await store.incr([[`relay:m:${minute}:${account}`, 120]]);
  if (perMinute > limits.perMinute) return "Slow down a little";
  const [perDay] = await store.incr([[`relay:d:${today(now)}:${account}`, 2 * 86_400]]);
  if (perDay > limits.perDay) return "Daily message limit reached. Post directly from your wallet, or try tomorrow.";
  const [total] = await store.incr([[`relay:d:${today(now)}:total`, 2 * 86_400]]);
  if (total > limits.dailyTotal) return "Free posting is paused for today. You can still post directly from your wallet.";
  return null;
}

/**
 * Runs `task` while holding the shared send lock, so two instances never send
 * from the relayer with the same nonce. Waits up to `waitMs` for the lock.
 */
export async function withSendLock<T>(store: LimitStore, task: () => Promise<T>, waitMs = 15_000): Promise<T> {
  const key = "relay:lock";
  const value = crypto.randomUUID();
  const until = Date.now() + waitMs;
  while (!(await store.lock(key, value, 20_000))) {
    if (Date.now() > until) throw new Error("Relay is busy. Try again in a moment.");
    await new Promise((r) => setTimeout(r, 150));
  }
  try {
    return await task();
  } finally {
    await store.unlock(key, value);
  }
}

// ---------------------------------------------------------------- stores

/** Redis over the Upstash REST API. */
export function restStore(url: string, token: string): LimitStore {
  async function call(path: string, body: unknown) {
    const res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Limit store error ${res.status}`);
    return res.json();
  }
  return {
    async incr(keys) {
      // Create each key at 0 with its TTL only if it's new, then INCR (works on any Redis version).
      const commands = keys.flatMap(([k, ttl]) => [["SET", k, "0", "NX", "EX", String(ttl)], ["INCR", k]]);
      const out = (await call("/pipeline", commands)) as { result?: number | string | null; error?: string }[];
      const failed = out.find((r) => r.error);
      if (failed) throw new Error(`Limit store error: ${failed.error}`);
      return keys.map((_, i) => Number(out[i * 2 + 1].result));
    },
    async lock(key, value, ttlMs) {
      const out = (await call("", ["SET", key, value, "NX", "PX", String(ttlMs)])) as { result: string | null };
      return out.result === "OK";
    },
    async push(key, value, max, ttl) {
      const out = (await call("/pipeline", [["LPUSH", key, value], ["LTRIM", key, "0", String(max - 1)], ["EXPIRE", key, String(ttl)]])) as { error?: string }[];
      const failed = out.find((r) => r.error);
      if (failed) throw new Error(`Store error: ${failed.error}`);
    },
    async list(key, max) {
      const out = (await call("", ["LRANGE", key, "0", String(max - 1)])) as { result?: string[] | null };
      return out.result ?? [];
    },
    async holder(key) {
      const out = (await call("", ["GET", key])) as { result?: string | null };
      return out.result ?? null;
    },
    async get(key) {
      const out = (await call("", ["GET", key])) as { result?: string | null };
      return out.result ?? null;
    },
    async set(key, value) {
      await call("", ["SET", key, value]);
    },
    async pushMany(lists) {
      const commands = lists
        .filter((l) => l.values.length > 0)
        .flatMap(({ key, values, max }) => [["LPUSH", key, ...values.slice(-max)], ["LTRIM", key, "0", String(max - 1)]]);
      if (commands.length === 0) return;
      const out = (await call("/pipeline", commands)) as { error?: string }[];
      const failed = out.find((r) => r.error);
      if (failed) throw new Error(`Store error: ${failed.error}`);
    },
    async unlock(key, value) {
      await call("", ["EVAL", "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", "1", key, value]);
    },
  };
}

/** Per-instance memory: local testing and unit tests only. */
export function memoryStore(): LimitStore {
  const counts = new Map<string, { n: number; until: number }>();
  const locks = new Map<string, { value: string; until: number }>();
  const lists = new Map<string, { items: string[]; until: number }>();
  const values = new Map<string, string>();
  return {
    async push(key, value, max, ttl) {
      const cur = lists.get(key);
      const items = cur && cur.until > Date.now() ? cur.items : [];
      lists.set(key, { items: [value, ...items].slice(0, max), until: Date.now() + ttl * 1000 });
    },
    async list(key, max) {
      const cur = lists.get(key);
      return cur && cur.until > Date.now() ? cur.items.slice(0, max) : [];
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
    },
    async pushMany(all) {
      for (const { key, values: pushed, max } of all) {
        const cur = lists.get(key);
        const items = cur && cur.until > Date.now() ? cur.items : [];
        lists.set(key, { items: [...pushed].reverse().concat(items).slice(0, max), until: Infinity });
      }
    },
    async incr(keys) {
      const now = Date.now();
      return keys.map(([k, ttl]) => {
        const cur = counts.get(k);
        const next = cur && cur.until > now ? { n: cur.n + 1, until: cur.until } : { n: 1, until: now + ttl * 1000 };
        counts.set(k, next);
        return next.n;
      });
    },
    async lock(key, value, ttlMs) {
      const cur = locks.get(key);
      if (cur && cur.until > Date.now()) return false;
      locks.set(key, { value, until: Date.now() + ttlMs });
      return true;
    },
    async unlock(key, value) {
      if (locks.get(key)?.value === value) locks.delete(key);
    },
    async holder(key) {
      const cur = locks.get(key);
      return cur && cur.until > Date.now() ? cur.value : null;
    },
  };
}

let fallback: LimitStore | null = null;

/** The configured store, or null when production has none (the relay then refuses). */
export function limitStore(): LimitStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) return restStore(url, token);
  if (process.env.NODE_ENV !== "production" || process.env.RELAY_ALLOW_MEMORY_LIMITS === "1") return (fallback ??= memoryStore());
  return null;
}
