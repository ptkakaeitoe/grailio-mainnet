import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, http, isAddress, isHex, keccak256, recoverTypedDataAddress, type Hex } from "viem";
import { rememberRecent } from "@/lib/chat-recent";
import { privateKeyToAccount } from "viem/accounts";
import { appChain, rpcUrl } from "@/lib/chain";

import { cookies } from "next/headers";
import { BETA_COOKIE, validToken } from "@/lib/beta-gate";
import { chatAbi, chatAddress, chatDomain, chatLive, chatTypes } from "@/lib/contracts";
import { checkLimits, limitStore, withSendLock, type LimitStore } from "@/lib/relay-limits";

/**
 * Gas relay for CollectChat. It only pays gas: every request carries a
 * signature the contract verifies (the wallet's for `register`, the session
 * key's for `postFor`), so the relayer can't forge, change or read messages.
 * Each call is simulated first so invalid requests never cost gas.
 */
export const maxDuration = 30;

const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain: appChain, transport });

/**
 * Spending limits. Every relayed transaction costs the relayer real BNB, so:
 *  - per wallet: 6 a minute and 300 a day (keyed by the account a post is from,
 *    recovered from its signature, not by the signature itself);
 *  - overall: RELAY_DAILY_LIMIT transactions per day (default 3,000, roughly
 *    $10 of gas at normal prices);
 *  - gas price: refuse above RELAY_MAX_GWEI (default 50) so a spike can't drain it;
 *  - balance: refuse below MIN_BALANCE so posts fail cleanly instead of mid-send.
 * Counters and the send lock are shared across server instances (lib/relay-limits).
 */
const LIMITS = { perMinute: 6, perDay: 300, dailyTotal: Number(process.env.RELAY_DAILY_LIMIT ?? 3_000) };
const MAX_GAS_PRICE = BigInt(Math.round(Number(process.env.RELAY_MAX_GWEI ?? 50) * 1e9));
const MIN_BALANCE = 1_000_000_000_000_000n; // 0.001 BNB: a post costs ~0.00001 BNB at BSC gas prices

/** Network and wallet checks before spending gas. */
async function relayerReady(address: Hex): Promise<string | null> {
  const [gasPrice, balance] = await Promise.all([publicClient.getGasPrice(), publicClient.getBalance({ address })]);
  if (gasPrice > MAX_GAS_PRICE) return "The network is busy. Free posting resumes when gas drops.";
  if (balance < MIN_BALANCE) {
    console.error(`chat relayer ${address} is low on BNB: ${balance} wei`);
    return "Free posting is temporarily unavailable.";
  }
  return null;
}

type Body =
  | { kind: "register"; owner: Hex; sessionKey: Hex; expiry: string; chatKey: Hex; signature: Hex; sessionSignature: Hex }
  | { kind: "post"; roomId: string; body: Hex; salt: Hex; signature: Hex };

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!chatLive) return bad("Chat is not deployed on this chain yet", 503);
  if (!(await validToken((await cookies()).get(BETA_COOKIE)?.value))) return bad("Beta access required", 401);
  // A dedicated key, so the chat wallet's BNB is the most it can ever spend.
  const raw = process.env.RELAYER_KEY;
  if (!raw) return bad("Chat relay is not configured", 503);
  // Limits must be shared across instances; without a store, don't spend.
  const store: LimitStore | null = limitStore();
  if (!store) {
    console.error("chat relay: no shared limit store (set UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN)");
    return bad("Free posting is temporarily unavailable.", 503);
  }
  const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
  const wallet = createWalletClient({ account, chain: appChain, transport });

  let req: Body;
  try {
    req = await request.json();
  } catch {
    return bad("Invalid JSON");
  }

  try {
    if (req.kind === "register") {
      if (!isAddress(req.owner) || !isAddress(req.sessionKey) || !isHex(req.chatKey) || !isHex(req.signature) || !isHex(req.sessionSignature)) return bad("Invalid register request");
      const limited = await checkLimits(store, req.owner.toLowerCase(), LIMITS);
      if (limited) return bad(limited, 429);
      const notReady = await relayerReady(account.address);
      if (notReady) return bad(notReady, 503);
      const args = [req.owner, req.sessionKey, BigInt(req.expiry), req.chatKey, req.signature, req.sessionSignature] as const;
      const hash = await withSendLock(store, async () => {
        const { request: tx } = await publicClient.simulateContract({ account, address: chatAddress, abi: chatAbi, functionName: "register", args });
        return wallet.writeContract(tx);
      });
      return Response.json({ hash });
    }

    if (req.kind === "post") {
      if (!isHex(req.body) || !isHex(req.salt) || !isHex(req.signature)) return bad("Invalid post request");
      if (req.body.length > 2 + 12_000 * 2) return bad("Message too long");
      // Who is this from? Recover the session key, then its owner; refuse
      // expired or muted accounts before spending any gas.
      const sessionKey = await recoverTypedDataAddress({
        domain: chatDomain, types: { Post: chatTypes.Post }, primaryType: "Post",
        message: { roomId: BigInt(req.roomId), bodyHash: keccak256(req.body), salt: req.salt },
        signature: req.signature,
      });
      const [owner, expiry] = await publicClient.readContract({ address: chatAddress, abi: chatAbi, functionName: "sessions", args: [sessionKey] });
      if (owner === "0x0000000000000000000000000000000000000000") return bad("Unknown session", 401);
      if (Number(expiry) * 1000 < Date.now()) return bad("Session expired", 401);
      const muted = await publicClient.readContract({ address: chatAddress, abi: chatAbi, functionName: "muted", args: [owner] });
      if (muted) return bad("This account is muted", 403);
      const limited = await checkLimits(store, owner.toLowerCase(), LIMITS);
      if (limited) return bad(limited, 429);
      const notReady = await relayerReady(account.address);
      if (notReady) return bad(notReady, 503);
      const args = [BigInt(req.roomId), req.body, req.salt, req.signature] as const;
      const hash = await withSendLock(store, async () => {
        const { request: tx } = await publicClient.simulateContract({ account, address: chatAddress, abi: chatAbi, functionName: "postFor", args });
        return wallet.writeContract(tx);
      });
      // Readers see it on their next poll, before the explorer indexes the event.
      await rememberRecent(store, { roomId: Number(req.roomId), author: owner, body: req.body, salt: req.salt, hash, time: Math.floor(Date.now() / 1000) })
        .catch((e) => console.error("chat relay: couldn't cache message", e instanceof Error ? e.message : e));
      return Response.json({ hash });
    }

    return bad("Unknown request");
  } catch (error) {
    // Simulation failures carry the contract's reason (NotAllowed, SessionExpired…).
    const reason = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : null;
    const name = reason instanceof ContractFunctionRevertedError ? reason.data?.errorName : undefined;
    const fallback = error instanceof Error ? (error as { shortMessage?: string }).shortMessage ?? error.message : "Relay failed";
    console.error("chat relay failed", name ?? fallback);
    return bad(name ? (REASONS[name] ?? name) : fallback.split("\n")[0], 422);
  }
}

/** Plain-English versions of CollectChat's errors. */
const REASONS: Record<string, string> = {
  NotAllowed: "You need a card of this room's stock to post here.",
  NotRegistered: "Unlock chat first.",
  Muted: "This account is muted.",
  SessionExpired: "Your chat session expired. Unlock chat again.",
  SessionTaken: "That session key belongs to another account.",
  BadSignature: "That signature didn't check out. Unlock chat again.",
  AlreadyPosted: "That message was already sent.",
  BodyTooLong: "Message too long.",
  UnknownRoom: "That room doesn't exist.",
};
