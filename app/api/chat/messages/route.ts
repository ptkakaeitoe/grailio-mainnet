import { recentMessages, type RecentMessage } from "@/lib/chat-recent";
import { chatFromBlock, chatLive } from "@/lib/contracts";
import { limitStore } from "@/lib/relay-limits";
import { nothingIndexed, roomLogs, syncLogs } from "@/lib/chain-logs";

/**
 * A chat room's Message events: /api/chat/messages?room=1&from=101184339
 *
 * The room history comes from the shared contract-log index (lib/chain-logs.ts:
 * eth_getLogs over public BSC RPCs, cached in Redis, the most recent ROOM_MAX
 * messages per room). Returns raw logs, oldest first; the browser decodes (and,
 * for holder rooms, decrypts) them. Public data only.
 */
export type RawChatLog = { topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string };

/** Messages the relay just sent (Redis), shown until their on-chain copies are indexed. */
async function recent(room: number): Promise<RecentMessage[]> {
  const store = limitStore();
  return store ? recentMessages(store, room).catch(() => []) : [];
}

export async function GET(req: Request) {
  if (!chatLive) return Response.json({ logs: [], recent: [] });
  const params = new URL(req.url).searchParams;
  const room = Number(params.get("room"));
  const fromParam = params.get("from");
  if (!Number.isInteger(room) || room < 0 || room > 10_000) return Response.json({ error: "Bad room" }, { status: 400 });
  let from = chatFromBlock;
  try {
    if (fromParam) from = BigInt(fromParam) > chatFromBlock ? BigInt(fromParam) : chatFromBlock;
  } catch {
    return Response.json({ error: "Bad block" }, { status: 400 });
  }

  try {
    const [sync, pending] = await Promise.all([syncLogs(), recent(room)]);
    if (nothingIndexed(sync)) throw new Error(sync.error);
    const logs: RawChatLog[] = (await roomLogs(room))
      .filter((l) => BigInt(l.blockNumber) >= from)
      .reverse()
      .map(({ topics, data, blockNumber, transactionHash, logIndex }) => ({ topics, data, blockNumber, transactionHash, logIndex }));
    // A couple of seconds of caching keeps many readers of one room to one upstream call.
    return Response.json({ logs, recent: pending }, { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Messages unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
