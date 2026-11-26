import { cookies, headers } from "next/headers";
import { createPublicClient, http, isAddress, isHex, recoverMessageAddress, zeroAddress } from "viem";

import { BETA_COOKIE, BETA_COOKIE_MAX_AGE, tokenForGift } from "@/lib/beta-gate";
import { appChain, rpcUrl } from "@/lib/chain";
import { collectPacksAbi, collectPacksAddress, collectPacksLive } from "@/lib/collect-packs";
import { GIFT_SIGNIN_MAX_AGE, giftSigninMessage } from "@/lib/gift-signin";

/**
 * A gift link as an invite: POST { signer, issuedAt, signature } where the
 * signature is the gift code's key signing giftSigninMessage(issuedAt). If
 * CollectPacks has an open gift for that signer, this browser gets the access
 * cookie and can sign in without a beta code. The gift code itself is never sent.
 */
const client = createPublicClient({ chain: appChain, transport: http(rpcUrl) });

const attempts = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > 10;
}

export async function POST(request: Request) {
  if (!collectPacksLive) return Response.json({ error: "Gifts aren't live yet." }, { status: 503 });
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return Response.json({ error: "Too many tries. Wait a few minutes." }, { status: 429 });

  let body: { signer?: string; issuedAt?: number; signature?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const { signer, issuedAt, signature } = body;
  const now = Math.floor(Date.now() / 1000);
  if (!signer || !isAddress(signer) || !isHex(signature) || typeof issuedAt !== "number" || Math.abs(now - issuedAt) > GIFT_SIGNIN_MAX_AGE) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const recovered = await recoverMessageAddress({ message: giftSigninMessage(issuedAt), signature });
    if (recovered.toLowerCase() !== signer.toLowerCase()) return Response.json({ error: "That gift code doesn't work." }, { status: 401 });
    // An open (unclaimed, uncancelled) gift must exist for this code.
    const id = await client.readContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "giftIdOf", args: [signer] });
    if (id === 0n) return Response.json({ error: "That gift code doesn't work." }, { status: 401 });
    const gift = await client.readContract({ address: collectPacksAddress, abi: collectPacksAbi, functionName: "gifts", args: [id] });
    const [, giftSigner, , , done] = gift as readonly [string, string, number, number, boolean, bigint];
    if (done || giftSigner === zeroAddress || giftSigner.toLowerCase() !== signer.toLowerCase()) {
      return Response.json({ error: "This gift was already claimed or cancelled." }, { status: 410 });
    }
  } catch {
    return Response.json({ error: "Couldn't check the gift. Try again." }, { status: 502 });
  }

  const token = await tokenForGift(signer);
  if (!token) return Response.json({ error: "Sign-in is closed right now." }, { status: 503 });
  (await cookies()).set(BETA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: BETA_COOKIE_MAX_AGE,
  });
  return Response.json({ unlocked: true });
}
