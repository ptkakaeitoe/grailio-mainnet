import { isAddress } from "viem";

import { listNfts } from "@/lib/nft-metadata";

/** A wallet's BNB Chain NFTs, for the profile-picture picker: /api/nfts?owner=0x… */
export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner") ?? "";
  if (!isAddress(owner)) return Response.json({ error: "Bad address" }, { status: 400 });
  try {
    const items = await listNfts(owner);
    return Response.json({ items }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return Response.json({ error: "Couldn't load NFTs right now" }, { status: 502 });
  }
}
