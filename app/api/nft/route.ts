import { isAddress } from "viem";

import { getNft } from "@/lib/nft-metadata";

/** One NFT's image and names, for showing NFT avatars: /api/nft?nft=0x…&id=123 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const nft = params.get("nft") ?? "";
  const id = params.get("id") ?? "";
  if (!isAddress(nft) || !/^\d{1,78}$/.test(id)) return Response.json({ error: "Bad request" }, { status: 400 });
  const item = await getNft(nft, id);
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(item, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
