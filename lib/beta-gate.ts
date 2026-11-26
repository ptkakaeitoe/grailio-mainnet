/**
 * Beta access gate for wallet connections (/api/beta, components/beta-access.tsx).
 * Browsing and demo mode are open to everyone.
 *
 * - BETA_ACCESS_CODES: comma-separated codes that unlock the app (server-only).
 * - BETA_COOKIE_SECRET: long random string used to sign the access cookie.
 *
 * The cookie holds HMAC(secret, code), never the code itself. Removing a code
 * from BETA_ACCESS_CODES locks out everyone who used it; rotating the secret
 * locks out everyone. With either variable unset the gate fails closed.
 */
/** Off: anyone can connect a wallet, swap and chat (no beta code). Set true to bring the gate back. */
export const BETA_GATE_ON = false;

export const BETA_COOKIE = "collect_beta";
export const BETA_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export function betaCodes(): string[] {
  return (process.env.BETA_ACCESS_CODES ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
}

function secret(): string | null {
  const value = process.env.BETA_COOKIE_SECRET ?? "";
  return value.length >= 16 ? value : null;
}

export function betaConfigured(): boolean {
  return secret() !== null && betaCodes().length > 0;
}

async function hmac(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Length-independent comparison, so timing doesn't leak how much matched. */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** The cookie value for a submitted code, or null if the code isn't valid. */
export async function tokenForCode(input: string): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const submitted = input.trim();
  let match: string | null = null;
  for (const code of betaCodes()) if (safeEqual(code, submitted)) match = code;
  return match === null ? null : hmac(key, `beta:${match}`);
}

/** Whether a cookie value was issued for a code that is still valid. */
export async function validToken(token: string | undefined): Promise<boolean> {
  if (!BETA_GATE_ON) return true;
  const key = secret();
  if (!key || !token) return false;
  if (token.startsWith("gift.")) return validGiftToken(token);
  let ok = false;
  for (const code of betaCodes()) if (safeEqual(await hmac(key, `beta:${code}`), token)) ok = true;
  return ok;
}

/**
 * Gift links count as an invite: whoever holds an open gift's code may connect
 * without a beta code (app/api/beta/gift). The cookie then holds
 * "gift.<signer>.<HMAC>", bound to that gift's signer address.
 */
export async function tokenForGift(signer: string): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const who = signer.toLowerCase();
  return `gift.${who}.${await hmac(key, `gift:${who}`)}`;
}

async function validGiftToken(token: string): Promise<boolean> {
  const key = secret();
  const [kind, who, mac] = token.split(".");
  if (!key || kind !== "gift" || !who || !mac) return false;
  return safeEqual(await hmac(key, `gift:${who}`), mac);
}
