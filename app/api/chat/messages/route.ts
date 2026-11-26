import { numberToHex, padHex, toEventSelector } from "viem";
import { recentMessages, type RecentMessage } from "@/lib/chat-recent";
import { chatAddress, chatFromBlock, chatLive } from "@/lib/contracts";
import { limitStore } from "@/lib/relay-limits";
import { latestBlock, logsUrl } from "@/lib/explorer-logs";

/**
 * A chat room's Message events: /api/chat/messages?room=1&from=101184339
 *
 * Public BSC RPCs cap log queries at a few thousand blocks, so the room history comes from
 * the explorer logs API (Etherscan v2, BNB Chain). Returns raw logs; the
 * browser decodes (and, for holder rooms, decrypts) them. Public data only.
 */
const MESSAGE = toEventSelector("Message(uint256,address,bytes,uint64)");

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

  // Up to the current block, not "latest", so cached answers stay fresh (lib/explorer-logs.ts).
  const query = new URLSearchParams({
    module: "logs", action: "getLogs", address: chatAddress, fromBlock: from.toString(), toBlock: await latestBlock(),
    topic0: MESSAGE, topic1: padHex(numberToHex(room), { size: 32 }), topic0_1_opr: "and", page: "1", offset: "1000",
  });
  try {
    const [res, pending] = await Promise.all([fetch(logsUrl(Object.fromEntries(query)), { cache: "no-store" }), recent(room)]);
    const body = (await res.json()) as { message: string; result: RawChatLog[] | string };
    if (Array.isArray(body.result)) {
      const logs = body.result.map(({ topics, data, blockNumber, transactionHash, logIndex }) => ({ topics, data, blockNumber, transactionHash, logIndex }));
      // A couple of seconds of caching keeps many readers of one room to one upstream call.
      return Response.json({ logs, recent: pending }, { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5" } });
    }
    if (/no records/i.test(body.message)) return Response.json({ logs: [], recent: pending }, { headers: { "Cache-Control": "public, s-maxage=2" } });
    throw new Error(body.message);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Messages unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
