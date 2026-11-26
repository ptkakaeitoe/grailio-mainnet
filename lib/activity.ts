import { decodeEventLog, parseAbi, type Address, type Hex } from "viem";

/**
 * A wallet's on-chain activity in Grailio: packs, reveals, redemptions, gifts,
 * staking and the market, read from contract event logs. Pure: no app imports,
 * so tests can load it directly.
 */
export const activityAbi = parseAbi([
  // CollectPacks
  "event PacksBought(address indexed buyer, uint256 indexed tierId, uint256 firstPackId, uint256 quantity, uint256 paid)",
  "event PackOpened(uint256 indexed packId, uint256 indexed cardId, address indexed owner, uint8 asset, uint8 rarity, uint128 usd, bool expired)",
  "event CardRedeemed(uint256 indexed cardId, address indexed to, bool filled, uint256 amount)",
  "event GiftBought(uint256 indexed giftId, address indexed from, uint256 indexed tierId, uint256 quantity, address signer)",
  "event GiftClaimed(uint256 indexed giftId, address indexed to, uint256 firstPackId)",
  "event PackRefunded(uint256 indexed packId, address indexed to, uint256 amount)",
  // CollectStaking
  "event Staked(address indexed owner, uint256 indexed cardId, uint256 weight)",
  "event Unstaked(address indexed owner, uint256 indexed cardId)",
  "event Claimed(address indexed owner, uint256 amount)",
  // CollectMarket
  "event Listed(address indexed nft, uint256 indexed tokenId, address indexed seller, uint256 price, bool inAvax, uint64 expiresAt)",
  "event Cancelled(address indexed nft, uint256 indexed tokenId, address indexed seller)",
  "event Sold(address indexed nft, uint256 indexed tokenId, address indexed buyer, address seller, uint256 price, uint256 fee, bool inAvax)",
]);

export type ActivityKind =
  | "bought" | "revealed" | "redeemed" | "giftBought" | "giftClaimed" | "refunded"
  | "staked" | "unstaked" | "claimed"
  | "listed" | "cancelled" | "sold" | "purchased";

/** Numbers are strings so the item survives JSON (bigints don't). */
export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  /** Unix seconds. */
  time: number;
  tx: Hex;
  cardId?: string;
  tier?: number;
  quantity?: number;
  /** USDC in its on-chain decimals, 18 on BNB Chain (paid, claimed, refunded, card value at opening). */
  usdc?: string;
  asset?: number;
  rarity?: number;
  /** Token amount paid out on redeem (the token's decimals), or a market price. */
  amount?: string;
  inAvax?: boolean;
};

/** An eth_getLogs-style log (hex strings) with its block time as `timeStamp` (lib/log-index.ts). */
export type RawLog = { address: string; topics: string[]; data: string; timeStamp: string; transactionHash: string; logIndex: string };

/**
 * Turns raw logs into activity for `account`, newest first. Logs that aren't
 * Grailio events, or Sold events where `account` was neither side, are dropped.
 */
export function toActivity(logs: RawLog[], account: Address): ActivityItem[] {
  const me = account.toLowerCase();
  const seen = new Set<string>();
  const items: ActivityItem[] = [];
  for (const log of logs) {
    const id = `${log.transactionHash}:${Number(log.logIndex)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    let ev;
    try {
      ev = decodeEventLog({ abi: activityAbi, data: log.data as Hex, topics: log.topics as [Hex, ...Hex[]] });
    } catch {
      continue;
    }
    const base = { id, time: Number(log.timeStamp), tx: log.transactionHash as Hex };
    const a = ev.args as Record<string, unknown>;
    const str = (v: unknown) => (v as bigint).toString();
    switch (ev.eventName) {
      case "PacksBought":
        items.push({ ...base, kind: "bought", tier: Number(a.tierId), quantity: Number(a.quantity), usdc: str(a.paid) });
        break;
      case "PackOpened":
        items.push({ ...base, kind: "revealed", cardId: str(a.cardId), asset: Number(a.asset), rarity: Number(a.rarity), usdc: str(a.usd) });
        break;
      case "CardRedeemed":
        items.push({ ...base, kind: "redeemed", cardId: str(a.cardId), amount: str(a.amount), ...(a.filled ? {} : { usdc: str(a.amount) }) });
        break;
      case "GiftBought":
        items.push({ ...base, kind: "giftBought", tier: Number(a.tierId), quantity: Number(a.quantity) });
        break;
      case "GiftClaimed":
        items.push({ ...base, kind: "giftClaimed" });
        break;
      case "PackRefunded":
        items.push({ ...base, kind: "refunded", usdc: str(a.amount) });
        break;
      case "Staked":
        items.push({ ...base, kind: "staked", cardId: str(a.cardId) });
        break;
      case "Unstaked":
        items.push({ ...base, kind: "unstaked", cardId: str(a.cardId) });
        break;
      case "Claimed":
        items.push({ ...base, kind: "claimed", usdc: str(a.amount) });
        break;
      case "Listed":
        items.push({ ...base, kind: "listed", cardId: str(a.tokenId), amount: str(a.price), inAvax: Boolean(a.inAvax) });
        break;
      case "Cancelled":
        items.push({ ...base, kind: "cancelled", cardId: str(a.tokenId) });
        break;
      case "Sold": {
        const buyer = String(a.buyer).toLowerCase();
        const seller = String(a.seller).toLowerCase();
        if (buyer !== me && seller !== me) break;
        items.push({ ...base, kind: seller === me ? "sold" : "purchased", cardId: str(a.tokenId), amount: str(a.price), inAvax: Boolean(a.inAvax) });
        break;
      }
    }
  }
  return items.sort((x, y) => y.time - x.time || y.id.localeCompare(x.id));
}
