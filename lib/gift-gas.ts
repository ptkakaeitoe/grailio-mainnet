/**
 * Gas for gift recipients (app/api/gift/gas). A new wallet has no BNB, so it
 * couldn't pay to claim its gift or open the packs. The relayer sends a small
 * top-up once, if the browser proves it holds an open gift's code by signing
 * this message, which names the receiving wallet, with the code's key.
 */
export const GIFT_GAS_AMOUNT = "0.0005"; // BNB (~$0.30): claiming and opening a pack costs ~0.00004 BNB at BNB Chain gas prices
/** Wallets holding at least this much (BNB) don't need a top-up. */
export const GIFT_GAS_THRESHOLD = "0.0002";
export const GIFT_GAS_MAX_AGE = 10 * 60; // seconds

export const giftGasMessage = (recipient: string, issuedAt: number) => `Grailio: gas for gift claim to ${recipient.toLowerCase()} (${issuedAt})`;

/** Ask the relayer for the top-up (browser). Signs with the gift code's key; the code itself isn't sent. */
export async function requestGiftGas(secret: string, recipient: string): Promise<void> {
  const { giftAccount } = await import("@/lib/gift-code");
  const issuedAt = Math.floor(Date.now() / 1000);
  const account = giftAccount(secret);
  const signature = await account.signMessage({ message: giftGasMessage(recipient, issuedAt) });
  const res = await fetch("/api/gift/gas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signer: account.address, recipient, issuedAt, signature }) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Couldn't add gas.");
}
