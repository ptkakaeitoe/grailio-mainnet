import type { LimitStore } from "@/lib/relay-limits";

/**
 * Messages the relay just submitted, kept briefly in Redis so every reader
 * sees them within one poll instead of waiting for the block explorer to
 * index the on-chain event. Bodies are exactly what goes on-chain (holder
 * rooms: ciphertext), so nothing here is more private than the chain.
 * Readers drop an entry once its on-chain copy arrives (same body hash);
 * entries that never confirm age out after RECENT_TTL.
 */
export type RecentMessage = { roomId: number; author: string; body: `0x${string}`; salt: `0x${string}`; hash: `0x${string}`; time: number };

export const RECENT_MAX = 100;
/** Seconds an unconfirmed message stays visible. */
export const RECENT_TTL = 600;

const key = (roomId: number) => `chat:recent:${roomId}`;

export async function rememberRecent(store: LimitStore, m: RecentMessage) {
  await store.push(key(m.roomId), JSON.stringify(m), RECENT_MAX, RECENT_TTL);
}

/** This room's recent relayed messages, oldest first, without any older than RECENT_TTL. */
export async function recentMessages(store: LimitStore, roomId: number, now = Date.now()): Promise<RecentMessage[]> {
  const raw = await store.list(key(roomId), RECENT_MAX);
  const cutoff = Math.floor(now / 1000) - RECENT_TTL;
  return raw
    .flatMap((s) => {
      try {
        const m = JSON.parse(s) as RecentMessage;
        return m.roomId === roomId && m.time >= cutoff ? [m] : [];
      } catch {
        return [];
      }
    })
    .reverse();
}
