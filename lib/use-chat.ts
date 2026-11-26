"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { bytesToHex, decodeEventLog, hexToBytes, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useAccount, usePublicClient, useReadContract, useReadContracts, useSignMessage, useSignTypedData } from "wagmi";

import { deriveChatKeys, encodePlain, KEY_MESSAGE, open, seal, type ChatKeys } from "@/lib/chat-crypto";
import { chatAbi, chatAddress, chatDomain, chatFromBlock, chatLive, chatTypes } from "@/lib/contracts";

/**
 * CollectChat client: the chat identity (one wallet signature), sending via
 * the gas relay, and reading + decrypting room events straight from the chain.
 */

/** kind: 0 open, 1 token balance, 2 cards of one asset (gateId). */
export type ChatRoom = { id: number; name: string; kind: number; gate: Hex; gateId: bigint; minBalance: bigint; encrypted: boolean };
export type ReplyRef = { id: string; author: string; text: string };
export type ChatMessage = {
  id: string;
  author: string;
  time: number;
  /** null when this reader can't decrypt it (sent before they joined). */
  text: string | null;
  /** The message this one answers, quoted at send time. */
  reply?: ReplyRef;
  status: "sent" | "sending" | "failed";
};

/**
 * Message content as stored (inside the encryption for holder rooms): plain
 * text, or a reply marker + JSON carrying a short quote of the original.
 */
const REPLY_MARK = "\u0001";
const QUOTE_CHARS = 90;
function encodeContent(text: string, reply?: ReplyRef) {
  if (!reply) return text;
  return REPLY_MARK + JSON.stringify({ t: text, r: { id: reply.id, a: reply.author, s: reply.text.slice(0, QUOTE_CHARS) } });
}
function decodeContent(raw: string): { text: string; reply?: ReplyRef } {
  if (!raw.startsWith(REPLY_MARK)) return { text: raw };
  try {
    const parsed = JSON.parse(raw.slice(1));
    return { text: String(parsed.t), reply: { id: String(parsed.r.id), author: String(parsed.r.a), text: String(parsed.r.s) } };
  } catch {
    return { text: raw.slice(1) };
  }
}

const SESSION_DAYS = 30n;
const POLL_MS = 4_000;

// ---- keys, kept per wallet in this browser -----------------------------------

const storageKey = (address: string) => `collect-chat:${chatAddress}:${address.toLowerCase()}`;
const listeners = new Set<() => void>();
function readStored(address: string | undefined) {
  if (!address) return null;
  try {
    return localStorage.getItem(storageKey(address));
  } catch {
    return null;
  }
}
function writeStored(address: string, keys: ChatKeys) {
  try {
    localStorage.setItem(storageKey(address), JSON.stringify({ ...keys, chatSecret: bytesToHex(keys.chatSecret) }));
  } catch { /* private mode: keys just won't persist */ }
  listeners.forEach((fn) => fn());
}
function useStoredKeys(address: string | undefined): ChatKeys | null {
  const raw = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    () => readStored(address),
    () => null,
  );
  return useMemo(() => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return { ...parsed, chatSecret: hexToBytes(parsed.chatSecret) } as ChatKeys;
    } catch {
      return null;
    }
  }, [raw]);
}

async function relay(payload: Record<string, unknown>): Promise<Hex> {
  const res = await fetch("/api/chat/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn’t reach the chat relay");
  return data.hash as Hex;
}

// ---- the hook ----------------------------------------------------------------

export function useChat() {
  const { address } = useAccount();
  const client = usePublicClient();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const keys = useStoredKeys(address);

  const { data: roomRows } = useReadContract({ address: chatAddress, abi: chatAbi, functionName: "rooms", query: { enabled: chatLive } });
  const rooms: ChatRoom[] = useMemo(
    () => (roomRows ?? []).map((r, id) => ({ id, name: r.name, kind: Number(r.kind), gate: r.gate, gateId: r.gateId, minBalance: r.minBalance, encrypted: r.encrypted })),
    [roomRows],
  );

  const { data: memberRows, refetch: refetchMembers } = useReadContract({
    address: chatAddress, abi: chatAbi, functionName: "members", query: { enabled: chatLive, refetchInterval: 30_000 },
  });
  const members = useMemo(
    () => (memberRows ? memberRows[0].map((account, i) => ({ account, key: memberRows[1][i] })) : []),
    [memberRows],
  );

  // Registered = the on-chain chat key matches ours and our session is live.
  const sessionAddress = keys ? privateKeyToAccount(keys.sessionSecret).address : undefined;
  const { data: onChainKey, refetch: refetchKey } = useReadContract({
    address: chatAddress, abi: chatAbi, functionName: "chatKeyOf", args: [address ?? "0x0000000000000000000000000000000000000000"], query: { enabled: chatLive && Boolean(address) },
  });
  const { data: session } = useReadContract({
    address: chatAddress, abi: chatAbi, functionName: "sessions", args: [sessionAddress ?? "0x0000000000000000000000000000000000000000"], query: { enabled: chatLive && Boolean(sessionAddress) },
  });
  // Sessions last 30 days, so a timestamp from mount is precise enough.
  const [mountedAt] = useState(() => BigInt(Date.now()));
  const ready = Boolean(
    keys && address && onChainKey?.toLowerCase() === keys.chatPublic.toLowerCase() &&
    session?.[0].toLowerCase() === address.toLowerCase() && session[1] * 1000n > mountedAt,
  );

  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  /** One signature derives the keys; a second authorises them on-chain (both gasless). */
  const enable = useCallback(async () => {
    if (!address || !client) return;
    setEnabling(true);
    setEnableError(null);
    try {
      const derived = deriveChatKeys(await signMessageAsync({ message: KEY_MESSAGE }));
      const sessionKey = privateKeyToAccount(derived.sessionSecret).address;
      const [currentKey, currentSession, nonce] = await Promise.all([
        client.readContract({ address: chatAddress, abi: chatAbi, functionName: "chatKeyOf", args: [address] }),
        client.readContract({ address: chatAddress, abi: chatAbi, functionName: "sessions", args: [sessionKey] }),
        client.readContract({ address: chatAddress, abi: chatAbi, functionName: "nonces", args: [address] }),
      ]);
      const alreadyLive = currentKey.toLowerCase() === derived.chatPublic.toLowerCase() &&
        currentSession[0].toLowerCase() === address.toLowerCase() && currentSession[1] * 1000n > BigInt(Date.now()) + 86_400_000n;
      if (!alreadyLive) {
        const expiry = BigInt(Math.floor(Date.now() / 1000)) + SESSION_DAYS * 86_400n;
        const signature = await signTypedDataAsync({
          domain: chatDomain, types: { Register: chatTypes.Register }, primaryType: "Register",
          message: { owner: address, sessionKey, expiry, chatKey: derived.chatPublic, nonce },
        });
        // The session key proves it's ours too, so nobody can register it under their name.
        const sessionSignature = await privateKeyToAccount(derived.sessionSecret).signTypedData({
          domain: chatDomain, types: { Session: chatTypes.Session }, primaryType: "Session",
          message: { owner: address, expiry, nonce },
        });
        const hash = await relay({ kind: "register", owner: address, sessionKey, expiry, chatKey: derived.chatPublic, signature, sessionSignature });
        await client.waitForTransactionReceipt({ hash });
      }
      writeStored(address, derived);
      await Promise.all([refetchKey(), refetchMembers()]);
    } catch (error) {
      const text = error instanceof Error ? error.message : "";
      setEnableError(/rejected|denied/i.test(text) ? "Cancelled in your wallet." : text.split("\n")[0] || "Couldn’t enable chat.");
    } finally {
      setEnabling(false);
    }
  }, [address, client, signMessageAsync, signTypedDataAsync, refetchKey, refetchMembers]);

  /** Members of `room` who can read it: everyone for open rooms, holders otherwise. */
  const readersOf = useCallback(async (room: ChatRoom) => {
    if (!client || !room.encrypted) return members;
    // The chat contract applies the room's own gate (cards of that token).
    const checks = await client.multicall({
      allowFailure: true,
      contracts: members.map((m) => ({ address: chatAddress, abi: chatAbi, functionName: "holds" as const, args: [BigInt(room.id), m.account] as const })),
    });
    return members.filter((_, i) => checks[i].status === "success" && checks[i].result === true);
  }, [client, members]);

  return { address, rooms, members, keys, ready, enable, enabling, enableError, readersOf, client };
}

/** Live messages for one room: history from the chain, polled every few seconds, decrypted locally. */
export function useRoomMessages(room: ChatRoom | undefined, keys: ChatKeys | null) {
  const client = usePublicClient();
  const { address } = useAccount();
  const [confirmed, setConfirmed] = useState<(ChatMessage & { bodyHash: Hex })[]>([]);
  const [pending, setPending] = useState<(ChatMessage & { bodyHash: Hex; roomId: number })[]>([]);
  /** Relayed by anyone, not yet indexed on-chain (from Redis via /api/chat/messages). */
  const [recent, setRecent] = useState<(ChatMessage & { bodyHash: Hex })[]>([]);
  const [loading, setLoading] = useState(true);
  const roomId = room?.id;
  const keysRef = useRef(keys);
  useEffect(() => { keysRef.current = keys; }, [keys]);

  useEffect(() => {
    if (!client || roomId === undefined) return;
    let cancelled = false;
    let from = chatFromBlock;
    let firstLoad = true;
    const seen = new Set<string>();
    const load = async () => {
      try {
        // History comes from /api/chat/messages (explorer logs API): public RPCs only allow short log queries.
        const res = await fetch(`/api/chat/messages?room=${roomId}&from=${from}`, { cache: "no-store" });
        if (!res.ok) throw new Error("messages unavailable");
        const body = (await res.json()) as {
          logs: { topics: Hex[]; data: Hex; blockNumber: string; transactionHash: Hex; logIndex: string }[];
          recent?: { author: Hex; body: Hex; hash: Hex; time: number }[];
        };
        const logs = body.logs.flatMap((raw) => {
          const id = `${raw.transactionHash}:${Number(raw.logIndex)}`;
          if (seen.has(id)) return [];
          seen.add(id);
          const block = BigInt(raw.blockNumber);
          if (block > from) from = block; // next poll starts at the newest block seen (inclusive; ids dedupe)
          try {
            const ev = decodeEventLog({ abi: chatAbi, eventName: "Message", data: raw.data, topics: raw.topics as [Hex, ...Hex[]] });
            return [{ args: ev.args, transactionHash: raw.transactionHash, logIndex: Number(raw.logIndex) }];
          } catch {
            return [];
          }
        });
        const next = await Promise.all(
          logs.map(async (log) => {
            const opened = await open(log.args.body!, keysRef.current);
            const content = opened.kind === "plain" || opened.kind === "sealed" ? decodeContent(opened.text) : null;
            return {
              id: `${log.transactionHash}:${log.logIndex}`,
              author: log.args.author!,
              time: Number(log.args.time),
              text: content?.text ?? null,
              reply: content?.reply,
              status: "sent" as const,
              bodyHash: keccak256(log.args.body!),
            };
          }),
        );
        // Messages the relay sent but the explorer hasn't indexed yet: shown now, replaced by the on-chain copy later.
        const fresh = await Promise.all(
          (body.recent ?? []).map(async (m) => {
            const opened = await open(m.body, keysRef.current);
            const content = opened.kind === "plain" || opened.kind === "sealed" ? decodeContent(opened.text) : null;
            return { id: `recent:${m.hash}`, author: m.author, time: m.time, text: content?.text ?? null, reply: content?.reply, status: "sent" as const, bodyHash: keccak256(m.body) };
          }),
        );
        if (cancelled) return;
        if (firstLoad) setConfirmed(next);
        else if (next.length) setConfirmed((prev) => [...prev, ...next]);
        setRecent(fresh);
        const arrived = new Set([...next, ...fresh].map((n) => n.bodyHash));
        if (arrived.size) setPending((prev) => prev.filter((p) => !arrived.has(p.bodyHash)));
      } catch { /* transient RPC error: next poll retries */ }
      finally {
        if (!cancelled && firstLoad) { firstLoad = false; setLoading(false); }
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); setLoading(true); setRecent([]); };
    // Keys changing (unlocking) re-reads so older messages decrypt too.
  }, [client, roomId, keys]);

  const all = useMemo(() => {
    // One copy per message: on-chain first, then relayed-not-indexed, then your own still being sent.
    const have = new Set(confirmed.map((m) => m.bodyHash));
    const relayed = recent.filter((m) => !have.has(m.bodyHash));
    relayed.forEach((m) => have.add(m.bodyHash));
    return [...confirmed, ...relayed, ...pending.filter((p) => p.roomId === roomId && !have.has(p.bodyHash))];
  }, [confirmed, recent, pending, roomId]);
  // Muted accounts can't post any more; their earlier messages are hidden
  // unless the reader asks to see them.
  const authors = useMemo(() => [...new Set(all.map((m) => m.author.toLowerCase()))] as Hex[], [all]);
  const { data: mutedRows } = useReadContracts({
    allowFailure: true,
    contracts: authors.map((a) => ({ address: chatAddress, abi: chatAbi, functionName: "muted" as const, args: [a] as const })),
    query: { enabled: chatLive && authors.length > 0, refetchInterval: 30_000 },
  });
  const muted = useMemo(
    () => new Set(authors.filter((_, i) => mutedRows?.[i]?.status === "success" && mutedRows[i].result === true)),
    [authors, mutedRows],
  );
  const [showMuted, setShowMuted] = useState(false);
  const messages = useMemo(
    () => (showMuted ? all : all.filter((m) => !muted.has(m.author.toLowerCase() as Hex))),
    [all, muted, showMuted],
  );
  const hiddenCount = all.length - messages.length;

  /** Seals (holder rooms) or encodes (open rooms), signs with the session key and relays. */
  const send = useCallback(
    async (text: string, readers: { key: Hex }[], reply?: ReplyRef) => {
      if (!room || !keys || !address) return;
      const content = encodeContent(text, reply);
      const body = room.encrypted ? await seal(content, [...readers.map((r) => r.key), keys.chatPublic]) : encodePlain(content);
      const bodyHash = keccak256(body);
      const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const item = { id: salt, author: address, time: Math.floor(Date.now() / 1000), text, reply, status: "sending" as const, bodyHash, roomId: room.id };
      setPending((prev) => [...prev, item]);
      try {
        const signature = await privateKeyToAccount(keys.sessionSecret).signTypedData({
          domain: chatDomain, types: { Post: chatTypes.Post }, primaryType: "Post",
          message: { roomId: BigInt(room.id), bodyHash, salt },
        });
        await relay({ kind: "post", roomId: room.id, body, salt, signature });
        // Accepted and submitted: show it as sent now; the on-chain copy replaces it when indexed.
        setPending((prev) => prev.map((p) => (p.id === salt ? { ...p, status: "sent" } : p)));
      } catch {
        setPending((prev) => prev.map((p) => (p.id === salt ? { ...p, status: "failed" } : p)));
      }
    },
    [room, keys, address],
  );

  const dismiss = useCallback((id: string) => setPending((prev) => prev.filter((p) => p.id !== id)), []);

  return { messages, loading, send, dismiss, hiddenCount, showMuted, setShowMuted };
}
