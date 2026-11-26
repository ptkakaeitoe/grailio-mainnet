import { createPublicClient, formatUnits, http } from "viem";

import { cardArt } from "@/lib/cards";
import { appChain, rpcUrl } from "@/lib/chain";
import { tickerForAsset, collectCardsAbi, collectPacksAddress, collectPacksLive } from "@/lib/collect-packs";
import { PACK_TIERS, RARITY_NAMES } from "@/lib/contracts";
import { tokenAmount } from "@/lib/format-amount";
import { TOKENS, PACK_DECIMALS } from "@/lib/tokens";

/**
 * Standard NFT metadata for a Grailio card: /api/card/3
 *
 * CollectPacks' tokenURI is baseURI + id; with the base set to
 * "https://<site>/api/card/", wallets, explorers and marketplaces read the
 * card's name, art and traits from here. Everything comes from the chain, so
 * it's always current (e.g. a card that was filled later).
 */
const client = createPublicClient({ chain: appChain, transport: http(rpcUrl) });

export async function GET(req: Request, ctx: RouteContext<"/api/card/[id]">) {
  const { id: raw } = await ctx.params;
  const idText = raw.replace(/\.json$/i, "");
  if (!collectPacksLive || !/^\d{1,78}$/.test(idText)) return Response.json({ error: "Not found" }, { status: 404 });
  const id = BigInt(idText);

  let card: readonly [number, number, number, boolean, bigint, bigint];
  try {
    // ownerOf reverts for cards that don't exist or were redeemed (burned).
    await client.readContract({ address: collectPacksAddress, abi: collectCardsAbi, functionName: "ownerOf", args: [id] });
    card = (await client.readContract({ address: collectPacksAddress, abi: collectCardsAbi, functionName: "cards", args: [id] })) as typeof card;
  } catch {
    return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=60" } });
  }

  const [asset, tier, rarity, filled, usd, amount] = card;
  const ticker = tickerForAsset(asset) ?? "?";
  const art = cardArt(ticker, rarity, tier);
  const token = TOKENS[ticker];
  const origin = new URL(req.url).origin;
  const atOpening = Number(formatUnits(usd, PACK_DECIMALS));
  const inside = filled && token ? `${tokenAmount(Number(formatUnits(amount, token.decimals)))} ${token.symbol}` : `${atOpening.toFixed(2)} USDT`;
  const name = `${art?.name ?? "Grailio card"} #${id}`;

  return Response.json(
    {
      name,
      description: `A ${RARITY_NAMES[rarity] ?? ""} Grailio card holding ${inside}. Keep it, stake it, trade it, or redeem it on Grailio for what's inside.`.replace("  ", " "),
      image: art ? `${origin}${art.src}` : undefined,
      external_url: `${origin}/marketplace`,
      background_color: "ffffff",
      attributes: [
        { trait_type: "Token", value: art?.tokenName ?? ticker },
        { trait_type: "Rarity", value: RARITY_NAMES[rarity] ?? String(rarity) },
        { trait_type: "Edition", value: PACK_TIERS[tier]?.name ?? String(tier) },
        { trait_type: "Inside", value: inside },
        { trait_type: "Value at opening (USD)", display_type: "number", value: atOpening },
        { trait_type: "Filled", value: filled ? "Yes" : "No" },
      ],
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600", "Access-Control-Allow-Origin": "*" } },
  );
}
