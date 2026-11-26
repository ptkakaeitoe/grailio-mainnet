import { createPublicClient, createWalletClient, http, isAddress, isHex, parseEther, recoverMessageAddress, zeroAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { appChain, rpcUrl } from "@/lib/chain";
import { collectPacksAbi, collectPacksAddress, collectPacksLive } from "@/lib/collect-packs";
import { GIFT_GAS_AMOUNT, GIFT_GAS_MAX_AGE, GIFT_GAS_THRESHOLD, giftGasMessage } from "@/lib/gift-gas";
import { limitStore, withSendLock } from "@/lib/relay-limits";

/**
 * POST { signer, recipient, issuedAt, signature }: a small BNB top-up from the
 * relayer so a gift recipient can pay to claim and open their packs.
 *
 * Only when: the gift code's key signed giftGasMessage(recipient, issuedAt)
 * recently, CollectPacks has an open gift for that key, the recipient holds
 * less than GIFT_GAS_THRESHOLD, and neither this gift nor this wallet got a
 * top-up before. A daily cap bounds the total. The code itself is never sent.
 */
const transport = http(rpcUrl);
const publicClient = createPublicClient({ chain: appChain, transport });
const DAILY_CAP = Number(process.env.GIFT_GAS_DAILY_LIMIT ?? 100);
const ONCE_MS = 365 * 86_400_000;
const MAX_GWEI = BigInt(Math.round(Number(process.env.RELAY_MAX_GWEI ?? 50) * 1e9));

const no = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  if (!collectPacksLive) return no("Gifts aren't live yet.", 503);
  const raw = process.env.RELAYER_KEY;
  const store = limitStore();
  if (!raw || !store) return no("Gas help is unavailable right now.", 503);

  let body: { signer?: string; recipient?: string; issuedAt?: number; signature?: string };
  try {
    body = await request.json();
  } catch {
    return no("Bad request");
  }
  const { signer, recipient, issuedAt, signature } = body;
  const now = Math.floor(Date.now() / 1000);
  if (!signer || !isAddress(signer) || !recipient || !isAddress(recipient) || !isHex(signature) || typeof issuedAt !== "number" || Math.abs(now - issuedAt) > GIFT_GAS_MAX_AGE) {
    return no("Bad request");
  }

  try {
    const recovered = await recoverMessageAddress({ message: giftGasMessage(recipient, issuedAt), signature });
    if (recovered.toLowerCase() !== signer.toLowerCase()) return no("That gift code doesn't work.", 401);
    const id = await publicClient.readContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "giftIdOf", args: [signer] });
    if (id === 0n) return no("That gift code doesn't work.", 401);
    const gift = await publicClient.readContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "gifts", args: [id] });
    const [, giftSigner, , , done] = gift as readonly [string, string, number, number, boolean, bigint];
    if (done || giftSigner === zeroAddress || giftSigner.toLowerCase() !== signer.toLowerCase()) return no("This gift was already claimed or cancelled.", 410);

    // Already has enough for gas: nothing to do.
    const balance = await publicClient.getBalance({ address: recipient });
    if (balance >= parseEther(GIFT_GAS_THRESHOLD)) return Response.json({ sent: false, reason: "has-gas" });

    // Once per gift and once per wallet, and a daily cap.
    const day = new Date().toISOString().slice(0, 10);
    const [today] = await store.incr([[`giftgas:day:${day}`, 2 * 86_400]]);
    if (today > DAILY_CAP) return no("Gas help is used up for today. Add a little BNB to claim.", 429);
    const giftKey = `giftgas:gift:${signer.toLowerCase()}`;
    if (!(await store.lock(giftKey, recipient.toLowerCase(), ONCE_MS))) {
      // Usually the same person signed in a different way (email vs Google), which gives another wallet.
      const earlier = await store.holder(giftKey);
      const where = earlier && earlier !== recipient.toLowerCase() ? ` (${earlier.slice(0, 6)}…${earlier.slice(-4)})` : "";
      return no(`This gift's free gas already went to another wallet${where}. Sign in the same way as last time to claim it there, or add a little BNB to this wallet.`, 409);
    }
    if (!(await store.lock(`giftgas:wallet:${recipient.toLowerCase()}`, signer.toLowerCase(), ONCE_MS))) {
      // Refused for this wallet: don't use up the gift's one top-up.
      await store.unlock(giftKey, recipient.toLowerCase()).catch(() => {});
      return no("This wallet already got free gas for another gift. Add a little BNB to claim.", 409);
    }

    // If sending fails, free the once-only keys so the person can try again.
    const release = () => Promise.all([
      store.unlock(`giftgas:gift:${signer.toLowerCase()}`, recipient.toLowerCase()),
      store.unlock(`giftgas:wallet:${recipient.toLowerCase()}`, signer.toLowerCase()),
    ]).catch(() => {});
    try {
      const account = privateKeyToAccount((raw.startsWith("0x") ? raw : `0x${raw}`) as Hex);
      const gasPrice = await publicClient.getGasPrice();
      if (gasPrice > MAX_GWEI) { await release(); return no("The network is busy. Try again in a few minutes.", 503); }
      const wallet = createWalletClient({ account, chain: appChain, transport });
      // Same send lock as the chat relay: one relayer, one nonce sequence.
      const hash = await withSendLock(store, () => wallet.sendTransaction({ to: recipient, value: parseEther(GIFT_GAS_AMOUNT) }));
      await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
      return Response.json({ sent: true, hash, amount: GIFT_GAS_AMOUNT });
    } catch (error) {
      await release();
      throw error;
    }
  } catch (error) {
    console.error("gift gas failed", error instanceof Error ? error.message.split("\n")[0] : error);
    return no("Couldn't add gas right now. Try again.", 502);
  }
}
