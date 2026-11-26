/** Social handles stored in CollectProfiles. Rules mirror CollectProfiles.setSocials. */
export type Socials = { x: string; telegram: string; instagram: string };

export const EMPTY_SOCIALS: Socials = { x: "", telegram: "", instagram: "" };

export const SOCIAL_NETWORKS = [
  { key: "x", label: "X", pattern: /^[A-Za-z0-9_]{1,15}$/, hint: "Up to 15 letters, numbers or _", url: (h: string) => `https://x.com/${h}` },
  { key: "telegram", label: "Telegram", pattern: /^[A-Za-z0-9_]{5,32}$/, hint: "5–32 letters, numbers or _", url: (h: string) => `https://t.me/${h}` },
  { key: "instagram", label: "Instagram", pattern: /^[A-Za-z0-9_.]{1,30}$/, hint: "Up to 30 letters, numbers, _ or .", url: (h: string) => `https://instagram.com/${h}` },
] as const satisfies readonly { key: keyof Socials; label: string; pattern: RegExp; hint: string; url: (h: string) => string }[];

/** "" is allowed: it clears the handle. */
export const validHandle = (network: (typeof SOCIAL_NETWORKS)[number], handle: string) =>
  handle === "" || network.pattern.test(handle);

/**
 * Accepts what people paste: "@ptk", "x.com/ptk", "https://t.me/ptk?x=1".
 * Returns the bare handle; validation happens separately.
 */
export function cleanHandle(input: string) {
  return input.trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?(x\.com|twitter\.com|t\.me|instagram\.com)\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
}
