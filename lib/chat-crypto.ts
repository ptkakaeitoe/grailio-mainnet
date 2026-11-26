/**
 * End-to-end encryption for holder rooms.
 *
 * Every member has an X25519 chat key pair derived from one wallet signature
 * (so it's the same on every device and never stored anywhere but the
 * browser). The public half is registered on-chain in CollectChat.
 *
 * A message is encrypted once with a fresh AES-256-GCM key, and that key is
 * wrapped separately for each current holder (ECDH with a one-off ephemeral
 * key, then HKDF). Only the listed holders can unwrap it; the chain, the
 * relayer and everyone else see ciphertext.
 *
 * Body layout (bytes):
 *   0x00 | utf8 text                                         — open rooms
 *   0x01 | ephPub(32) | count(u16) | count × [keyId(4) | iv(12) | wrapped(48)]
 *        | iv(12) | ciphertext                                — holder rooms
 */
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes, type Hex } from "viem";

const PLAIN = 0x00;
const SEALED = 0x01;
const WRAP_INFO = new TextEncoder().encode("collect-chat-wrap-v1");
const ENTRY = 4 + 12 + 48;

/** The message the wallet signs to derive chat keys. Changing it changes every key. */
export const KEY_MESSAGE =
  "Unlock Grailio chat\n\nThis signature creates your private chat key on this device. It never leaves your browser and costs no gas.";

export type ChatKeys = {
  /** X25519 secret for decrypting holder rooms. */
  chatSecret: Uint8Array;
  /** X25519 public key, registered on-chain as bytes32. */
  chatPublic: Hex;
  /** secp256k1 key that signs messages so the relayer can submit them. */
  sessionSecret: Hex;
};

/** Deterministic: the same wallet signature always yields the same keys. */
export function deriveChatKeys(walletSignature: Hex): ChatKeys {
  const seed = hexToBytes(walletSignature);
  const chatSecret = sha256(concat(new TextEncoder().encode("collect-chat-x25519"), seed));
  const sessionSecret = sha256(concat(new TextEncoder().encode("collect-chat-session"), seed));
  return {
    chatSecret,
    chatPublic: bytesToHex(x25519.getPublicKey(chatSecret)),
    sessionSecret: bytesToHex(sessionSecret),
  };
}

export function encodePlain(text: string): Hex {
  return bytesToHex(concat(Uint8Array.of(PLAIN), new TextEncoder().encode(text)));
}

/** Encrypts `text` so only the holders of `recipients` (chat public keys) can read it. */
export async function seal(text: string, recipients: Hex[]): Promise<Hex> {
  const unique = [...new Set(recipients.map((r) => r.toLowerCase() as Hex))];
  const contentKey = random(32);
  const ephSecret = random(32);
  const ephPublic = x25519.getPublicKey(ephSecret);

  const entries = await Promise.all(
    unique.map(async (recipient) => {
      const pub = hexToBytes(recipient);
      const wrapKey = hkdf(sha256, x25519.getSharedSecret(ephSecret, pub), ephPublic, WRAP_INFO, 32);
      const iv = random(12);
      const wrapped = await aesGcm("encrypt", wrapKey, iv, contentKey);
      return concat(keyId(pub), iv, wrapped);
    }),
  );

  const iv = random(12);
  const ciphertext = await aesGcm("encrypt", contentKey, iv, new TextEncoder().encode(text));
  const count = new Uint8Array(2);
  new DataView(count.buffer).setUint16(0, entries.length);
  return bytesToHex(concat(Uint8Array.of(SEALED), ephPublic, count, ...entries, iv, ciphertext));
}

export type Opened =
  | { kind: "plain"; text: string }
  | { kind: "sealed"; text: string }
  /** Encrypted, but not to this reader (e.g. sent before they joined). */
  | { kind: "locked" }
  | { kind: "invalid" };

/** Reads a message body. `keys` is needed only for sealed messages. */
export async function open(body: Hex, keys: ChatKeys | null): Promise<Opened> {
  const bytes = hexToBytes(body);
  if (bytes[0] === PLAIN) return { kind: "plain", text: new TextDecoder().decode(bytes.slice(1)) };
  if (bytes[0] !== SEALED || bytes.length < 1 + 32 + 2) return { kind: "invalid" };
  if (!keys) return { kind: "locked" };

  const ephPublic = bytes.slice(1, 33);
  const count = new DataView(bytes.buffer, bytes.byteOffset + 33, 2).getUint16(0);
  const bodyStart = 35 + count * ENTRY;
  if (bytes.length < bodyStart + 12) return { kind: "invalid" };

  const myId = keyId(hexToBytes(keys.chatPublic));
  for (let i = 0; i < count; i++) {
    const at = 35 + i * ENTRY;
    if (!equal(bytes.slice(at, at + 4), myId)) continue;
    try {
      const wrapKey = hkdf(sha256, x25519.getSharedSecret(keys.chatSecret, ephPublic), ephPublic, WRAP_INFO, 32);
      const contentKey = await aesGcm("decrypt", wrapKey, bytes.slice(at + 4, at + 16), bytes.slice(at + 16, at + ENTRY));
      const plain = await aesGcm("decrypt", contentKey, bytes.slice(bodyStart, bodyStart + 12), bytes.slice(bodyStart + 12));
      return { kind: "sealed", text: new TextDecoder().decode(plain) };
    } catch {
      // A 4-byte key id can collide; keep looking.
    }
  }
  return { kind: "locked" };
}

// ---- helpers ---------------------------------------------------------------

async function aesGcm(mode: "encrypt" | "decrypt", key: Uint8Array, iv: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, "AES-GCM", false, [mode]);
  const out = await crypto.subtle[mode]({ name: "AES-GCM", iv: iv as BufferSource }, k, data as BufferSource);
  return new Uint8Array(out);
}

function keyId(publicKey: Uint8Array) {
  return sha256(publicKey).slice(0, 4);
}

function random(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function equal(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
