import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Gift codes. A live code is 125 random bits in base32, e.g. "K7Q2M-9XAD4-…".
 * keccak256 of the code's bytes is a private key; CollectPacks stores that key's
 * address with the gift (giftIdOf) and checks claims are signed by it, bound to
 * the claimer's address. A demo code starts with "DEMO-" and says the pack type
 * and count, since demo wallets live in each browser.
 * Share links put the code after "#", so it never reaches a server.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U
const SECRET_CHARS = 25; // 125 bits, five groups of five

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SECRET_CHARS));
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
}

const group = (s: string) => s.match(/.{1,5}/g)!.join("-");

/** Upper-cases, maps look-alikes (O→0, I/L→1) and drops spaces and dashes. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

export type ParsedGift =
  | { kind: "live"; secret: string }
  | { kind: "demo"; secret: string; tier: number; quantity: number }
  | null;

export function parseCode(input: string): ParsedGift {
  const raw = input.trim().toUpperCase();
  if (raw.startsWith("DEMO-")) {
    const m = raw.match(/^DEMO-(\d)(\d{2})-([0-9A-Z-]+)$/);
    if (!m) return null;
    const secret = normalizeCode(m[3]);
    const quantity = Number(m[2]);
    if (secret.length !== SECRET_CHARS || quantity < 1 || quantity > 10) return null;
    return { kind: "demo", secret, tier: Number(m[1]), quantity };
  }
  const secret = normalizeCode(raw);
  if (secret.length !== SECRET_CHARS || [...secret].some((c) => !ALPHABET.includes(c))) return null;
  return { kind: "live", secret };
}

/** A new live gift code and the address CollectPacks stores for it. */
export function newLiveCode() {
  const secret = randomSecret();
  return { code: group(secret), signer: giftAccount(secret).address };
}

export function newDemoCode(tier: number, quantity: number) {
  return `DEMO-${tier}${String(quantity).padStart(2, "0")}-${group(randomSecret())}`;
}

/** The signing key a live code stands for. */
export function giftAccount(secret: string) {
  return privateKeyToAccount(keccak256(toHex(normalizeCode(secret))));
}

/** Share link for a code (the code stays in the URL hash). */
export function giftLink(code: string) {
  return `${window.location.origin}/collection#${code}`;
}
