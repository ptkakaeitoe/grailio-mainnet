import { decodeEventLog, keccak256, toBytes, toEventSelector, zeroAddress, type Hex } from "viem";
import deployment from "@/deployments/56.json";
import { activityAbi } from "@/lib/activity";
import { rpcUrl } from "@/lib/chain";
import { limitStore, memoryStore, type LimitStore } from "@/lib/relay-limits";
import { logReader, readList, syncIndex, type StoredLog, type SyncResult } from "@/lib/log-index";

/**
 * Grailio's contract logs for the activity feed and chat history (server only).
 *
 * One shared index (lib/log-index.ts) reads every log of the pack, staking,
 * market and chat contracts with eth_getLogs, one chunk per call, and files
 * each log under the wallets it involves and, for chat messages, its room.
 * State lives in the relay's Redis (Upstash / Vercel KV) so all instances
 * share one cursor; without it (local dev) it's per-instance memory.
 */
const d = deployment as Record<string, unknown> & { deployBlocks?: Record<string, number> };
const addr = (key: string) => String(d[key] ?? zeroAddress).toLowerCase();
const packs = addr("collectPacks");
const chat = addr("collectChat");
const contracts = [packs, addr("collectStaking"), addr("collectMarket"), chat].filter((a) => a !== zeroAddress);

/** Most recent events kept per wallet / per room (the activity drawer and chat show these). */
export const WALLET_MAX = 300;
export const ROOM_MAX = 500;

const MESSAGE = toEventSelector("Message(uint256,address,bytes,uint64)");
/** Address arguments that aren't a participant (the NFT contract, a gift's signing key). */
const NOT_A_WALLET = new Set(["nft", "signer"]);

/**
 * Answers eth_getLogs up to 10,000 blocks. bsc-dataseed (the app's default RPC)
 * and nodereal refuse getLogs outright ("-32005 limit exceeded"), so the default
 * isn't used here; a custom NEXT_PUBLIC_BSC_RPC_URL is tried first.
 */
const LOGS_RPC = "https://bsc-rpc.publicnode.com";
const customRpc = process.env.NEXT_PUBLIC_BSC_RPC_URL ? rpcUrl : "";

const deployBlocks = Object.values(d.deployBlocks ?? {});
const startBlock = BigInt(deployBlocks.length ? Math.min(...deployBlocks) : 0);
/** Namespaced by the contract set, so a redeploy starts a fresh index. */
const ns = `logs:56:${keccak256(toBytes(contracts.join(","))).slice(2, 10)}`;

/** Which lists a log belongs to: its chat room, or the wallets in its address arguments. */
export function routeLog(log: StoredLog): { list: string; max: number }[] {
  if (log.address === chat) {
    return log.topics[0] === MESSAGE && log.topics[1] ? [{ list: `room:${BigInt(log.topics[1])}`, max: ROOM_MAX }] : [];
  }
  try {
    const ev = decodeEventLog({ abi: activityAbi, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
    const args = ev.args as Record<string, unknown>;
    const wallets = new Set<string>();
    for (const [name, value] of Object.entries(args)) {
      if (NOT_A_WALLET.has(name) || typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) continue;
      // Card sales only for the seller (the old explorer query read Sold events of the pack NFT).
      if (ev.eventName === "Sold" && name === "seller" && String(args.nft).toLowerCase() !== packs) continue;
      wallets.add(value.toLowerCase());
    }
    return [...wallets].filter((w) => w !== zeroAddress).map((w) => ({ list: `w:${w}`, max: WALLET_MAX }));
  } catch {
    return []; // admin events (tiers, assets, rooms…): not shown anywhere
  }
}

let memory: LimitStore | null = null;
const store = () => limitStore() ?? (memory ??= memoryStore());
const reader = logReader([customRpc, LOGS_RPC]);

/** Moves the shared index toward the chain head (bounded work; never throws). */
export function syncLogs(): Promise<SyncResult> {
  return syncIndex({ store: store(), reader, ns, filter: { address: contracts }, startBlock, route: routeLog });
}

/** True if nothing could be indexed yet (sync failed from the start). */
export const nothingIndexed = (r: SyncResult) => Boolean(r.error) && r.cursor <= startBlock;

/** A wallet's indexed logs, newest first. */
export const walletLogs = (wallet: string) => readList(store(), ns, `w:${wallet.toLowerCase()}`, WALLET_MAX);

/** A chat room's indexed Message logs, newest first. */
export const roomLogs = (room: number) => readList(store(), ns, `room:${room}`, ROOM_MAX);
