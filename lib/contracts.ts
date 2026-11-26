import { zeroAddress, type Address } from "viem";
import { appChain, explorerUrl } from "@/lib/chain";
import { collectPacksLive } from "@/lib/collect-packs";

import deployment from "@/deployments/56.json";

export const treasury = deployment.treasury as Address;

/** Addresses written by contracts/script/DeployCollectPacks.s.sol; absent until it has run. */
const deployed = deployment as {
  collectChat?: string; collectNames?: string; collectAvatars?: string; deployBlocks?: Record<string, number>;
};
/** On-chain community chat (CollectChat, deployed by DeployCollectPacks.s.sol). Messages are events from here. */
export const chatAddress = (deployed.collectChat ?? zeroAddress) as Address;
export const chatLive = chatAddress !== zeroAddress;
/** First block to read chat events from. */
export const chatFromBlock = BigInt(deployed.deployBlocks?.collectChat ?? 0);
/** Where the previous chat's history starts, so it still shows after the redeploy. */
export const chatV1FromBlock = BigInt(deployed.deployBlocks?.collectChatV1 ?? 0);

/** On-chain usernames (DeployNames.s.sol). */
export const namesAddress = (deployed.collectNames ?? zeroAddress) as Address;
export const namesLive = namesAddress !== zeroAddress;
export const namesAbi = [
  { type: "function", name: "nameOf", inputs: [{ type: "address" }], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "ownerOf", inputs: [{ type: "string" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "setName", inputs: [{ type: "string" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "clearName", inputs: [], outputs: [], stateMutability: "nonpayable" },
] as const;

/** Profiles: a picture cropped from an owned card, and a bio (DeployProfiles.s.sol). */
export const avatarsAddress = ((deployed as { collectProfiles?: string }).collectProfiles ?? zeroAddress) as Address;
export const avatarsLive = collectPacksLive && avatarsAddress !== zeroAddress;
export const avatarsAbi = [
  {
    type: "function", name: "avatarOf", inputs: [{ type: "address" }], stateMutability: "view",
    outputs: [{ name: "ok", type: "bool" }, { name: "nft", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "x", type: "uint16" }, { name: "y", type: "uint16" }, { name: "zoom", type: "uint16" }],
  },
  { type: "function", name: "setAvatar", inputs: [{ type: "uint256" }, { type: "uint16" }, { type: "uint16" }, { type: "uint16" }], outputs: [], stateMutability: "nonpayable" },
  /** Any ERC-721 you own on BNB Chain as your picture. */
  { type: "function", name: "setNftAvatar", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint16" }, { type: "uint16" }, { type: "uint16" }], outputs: [], stateMutability: "nonpayable" },
  { type: "error", name: "NotYourNft", inputs: [{ type: "address" }, { type: "uint256" }] },
  { type: "error", name: "NotYourCard", inputs: [{ type: "uint256" }] },
  { type: "function", name: "clearAvatar", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "bioOf", inputs: [{ type: "address" }], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "setBio", inputs: [{ type: "string" }], outputs: [], stateMutability: "nonpayable" },
  {
    type: "function", name: "socialsOf", inputs: [{ type: "address" }], stateMutability: "view",
    outputs: [{ type: "tuple", components: [{ name: "x", type: "string" }, { name: "telegram", type: "string" }, { name: "instagram", type: "string" }] }],
  },
  {
    type: "function", name: "setDetails", outputs: [], stateMutability: "nonpayable",
    inputs: [{ type: "string" }, { type: "tuple", components: [{ name: "x", type: "string" }, { name: "telegram", type: "string" }, { name: "instagram", type: "string" }] }],
  },
] as const;
export const MAX_BIO = 160;

/** CardMarket.feeBps at deploy: 1%. */
export const MARKET_FEE = 0.01;

export const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"] as const;

/**
 * Pack tiers, indexed by their CollectPacks tier id. Fable, Saga and Mythos are
 * three sizes ($1, $3, $5); each will come in Low, Medium and High risk. Low:
 * every card holds 95% of the price. Medium/High: odds set the value.
 */
export const PACK_TIERS = [
  // Fable ($1) in three risks. Medium and High are on-chain but switched off until the pool is funded.
  { id: 0, name: "Fable", level: "Low", risk: "Every card holds $0.95", range: "$0.95 in tokens", price: 1, odds: [50, 25, 20, 5], backing: [0.95, 0.95, 0.95, 0.95], retired: false },
  { id: 1, name: "Fable · Medium", level: "Medium", risk: "Medium risk", range: "$0.46–$4.00 in tokens", price: 1, odds: [50, 25, 20, 5], backing: [0.46, 0.8, 1.4, 4], retired: false },
  { id: 2, name: "Fable · High", level: "High", risk: "High risk", range: "$0.20–$10.13 in tokens", price: 1, odds: [60, 25, 12, 3], backing: [0.2, 0.6, 2.8, 10.13], retired: false },
  // Saga ($3) and Mythos ($5), Low risk. Tier 4 is a duplicate Saga added by mistake: switched off on-chain and hidden.
  { id: 3, name: "Saga", level: "Low", risk: "Every card holds $2.85", range: "$2.85 in tokens", price: 3, odds: [50, 25, 20, 5], backing: [2.85, 2.85, 2.85, 2.85], retired: false },
  { id: 4, name: "Saga", level: "Low", risk: "Every card holds $2.85", range: "$2.85 in tokens", price: 3, odds: [50, 25, 20, 5], backing: [2.85, 2.85, 2.85, 2.85], retired: true },
  { id: 5, name: "Mythos", level: "Low", risk: "Every card holds $4.75", range: "$4.75 in tokens", price: 5, odds: [50, 25, 20, 5], backing: [4.75, 4.75, 4.75, 4.75], retired: false },
  // Planned: Medium and High for Saga and Mythos. Add them on-chain in this order so the ids match (6, 7, 8, 9).
  { id: 6, name: "Saga · Medium", level: "Medium", risk: "Medium risk", range: "$1.38–$12.00 in tokens", price: 3, odds: [50, 25, 20, 5], backing: [1.38, 2.4, 4.2, 12], retired: false },
  { id: 7, name: "Saga · High", level: "High", risk: "High risk", range: "$0.60–$30.39 in tokens", price: 3, odds: [60, 25, 12, 3], backing: [0.6, 1.8, 8.4, 30.39], retired: false },
  { id: 8, name: "Mythos · Medium", level: "Medium", risk: "Medium risk", range: "$2.30–$20.00 in tokens", price: 5, odds: [50, 25, 20, 5], backing: [2.3, 4, 7, 20], retired: false },
  { id: 9, name: "Mythos · High", level: "High", risk: "High risk", range: "$1.00–$50.65 in tokens", price: 5, odds: [60, 25, 12, 3], backing: [1, 3, 14, 50.65], retired: false },
] as const;

/** The packs on offer (retired tiers left out), cheapest first. */
export const SHOWN_TIERS = PACK_TIERS.filter((t) => !t.retired);

/** Stock token address → ticker, for turning a card's backing into art. */
export const tickerForStock = (address: string) =>
  Object.entries(stockTokens ?? {}).find(([, a]) => a.toLowerCase() === address.toLowerCase())?.[0];

/**
 * One StockToken per ticker (StockToken.sol). These supersede the single
 * curve-bound WBNB: minting authority is a revocable set, so packs, curves and
 * oracle-priced minters can all be wired in later.
 */
export const stockTokens = deployment.stockTokens as Record<string, Address>;

export const stockTokenFor = (ticker: string): Address | undefined => {
  const address = stockTokens?.[ticker];
  return address && address !== zeroAddress ? (address as Address) : undefined;
};

export const stockTokenAbi = [
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "ticker", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "maxSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

/** Sample card definitions used by the offline demo. */
export const RARITIES = [
  { id: 0, label: "Common", slug: "joe-key", reward: 25, odds: "50%" },
  { id: 1, label: "Rare", slug: "btc-seed", reward: 75, odds: "25%" },
  { id: 2, label: "Epic", slug: "link-crown", reward: 200, odds: "20%" },
  { id: 3, label: "Legendary", slug: "avax-eye", reward: 500, odds: "5%" },
] as const;

/** Drawn in the hero fan, but has no on-chain token ID in this series. */
export const UNMINTED_SLUG = "eth-prism";

export const SNOWTRACE = explorerUrl;

/** Standard ERC20 approvals: every contract pulls payments with these. */
export const erc20Abi = [
  { type: "function", name: "allowance", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;


/** Blocks an opening pack's reveal hash stays readable (the EVM keeps 256). */
export const REVEAL_WINDOW_BLOCKS = 256;

export const stockCardAbi = [
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "tokenOfOwnerByIndex", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    type: "function",
    name: "cardOf",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "tuple", components: [{ type: "address", name: "stock" }, { type: "uint256", name: "amount" }, { type: "uint8", name: "rarity" }, { type: "uint8", name: "tier" }] }],
    stateMutability: "view",
  },
  { type: "function", name: "redeem", inputs: [{ type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "safeTransferFrom", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "safeTransferFrom", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "isApprovedForAll", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "setApprovalForAll", inputs: [{ type: "address" }, { type: "bool" }], outputs: [], stateMutability: "nonpayable" },
] as const;

export const cardStakingAbi = [
  { type: "function", name: "stake", inputs: [{ type: "uint256[]" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "unstake", inputs: [{ type: "uint256[]" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "claim", inputs: [{ type: "uint256[]" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "pending", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "stakes", inputs: [{ type: "uint256" }], outputs: [{ type: "address", name: "owner" }, { type: "uint64", name: "since" }], stateMutability: "view" },
  { type: "function", name: "stakedBy", inputs: [{ type: "address" }], outputs: [{ type: "uint256[]" }], stateMutability: "view" },
] as const;

/** CardMarket: non-custodial listings of cards and sealed packs, with expiry. */
export const cardMarketAbi = [
  {
    type: "function",
    name: "allListings",
    inputs: [],
    outputs: [
      { type: "address[]", name: "nfts" }, { type: "uint256[]", name: "tokenIds" }, { type: "address[]", name: "sellers" },
      { type: "uint256[]", name: "prices" }, { type: "uint64[]", name: "expiresAts" },
    ],
    stateMutability: "view",
  },
  { type: "function", name: "isValid", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "list", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "relist", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "cancel", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "buy", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "buyWith", inputs: [{ type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "payable" },
  { type: "function", name: "clearInvalid", inputs: [{ type: "address[]" }, { type: "uint256[]" }], outputs: [], stateMutability: "nonpayable" },
  { type: "error", name: "ListingExpired", inputs: [{ type: "address", name: "nft" }, { type: "uint256", name: "tokenId" }] },
  { type: "error", name: "ListingInvalid", inputs: [{ type: "address", name: "nft" }, { type: "uint256", name: "tokenId" }] },
  { type: "error", name: "NotApproved", inputs: [{ type: "address", name: "nft" }] },
  { type: "error", name: "BadExpiry", inputs: [{ type: "uint64", name: "expiresAt" }] },
] as const;
/** Listing lengths offered in the app; the contract allows 1 hour to 30 days. */
export const LISTING_DAYS = [1, 3, 7, 30] as const;

export const chatAbi = [
  {
    type: "function",
    name: "rooms",
    inputs: [],
    outputs: [{ type: "tuple[]", components: [{ type: "string", name: "name" }, { type: "uint8", name: "kind" }, { type: "address", name: "gate" }, { type: "uint256", name: "gateId" }, { type: "uint256", name: "minBalance" }, { type: "bool", name: "encrypted" }] }],
    stateMutability: "view",
  },
  { type: "function", name: "members", inputs: [], outputs: [{ type: "address[]", name: "accounts" }, { type: "bytes32[]", name: "keys" }], stateMutability: "view" },
  { type: "function", name: "chatKeyOf", inputs: [{ type: "address" }], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "nonces", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "sessions", inputs: [{ type: "address" }], outputs: [{ type: "address", name: "owner" }, { type: "uint64", name: "expiry" }], stateMutability: "view" },
  { type: "function", name: "canPost", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  /** Whether a wallet meets a room's gate: for card rooms, holds a card of that token. */
  { type: "function", name: "holds", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "muted", inputs: [{ type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "moderator", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "setMuted", inputs: [{ type: "address" }, { type: "bool" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "revoke", inputs: [{ type: "address" }], outputs: [], stateMutability: "nonpayable" },
  { type: "event", name: "MutedSet", inputs: [{ type: "address", name: "account", indexed: true }, { type: "bool", name: "muted", indexed: false }] },
  {
    type: "function",
    name: "register",
    inputs: [
      { type: "address", name: "owner" }, { type: "address", name: "sessionKey" }, { type: "uint64", name: "expiry" },
      { type: "bytes32", name: "chatKey" }, { type: "bytes", name: "ownerSignature" }, { type: "bytes", name: "sessionSignature" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "postFor",
    inputs: [{ type: "uint256", name: "roomId" }, { type: "bytes", name: "body" }, { type: "bytes32", name: "salt" }, { type: "bytes", name: "signature" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Message",
    inputs: [
      { type: "uint256", name: "roomId", indexed: true },
      { type: "address", name: "author", indexed: true },
      { type: "bytes", name: "body", indexed: false },
      { type: "uint64", name: "time", indexed: false },
    ],
  },
  // Contract errors, so refusals read as reasons ("NotAllowed") instead of raw selectors.
  { type: "error", name: "NotAllowed", inputs: [{ type: "uint256", name: "roomId" }, { type: "address", name: "author" }] },
  { type: "error", name: "NotRegistered", inputs: [{ type: "address", name: "author" }] },
  { type: "error", name: "Muted", inputs: [{ type: "address", name: "account" }] },
  { type: "error", name: "SessionExpired", inputs: [{ type: "address", name: "sessionKey" }] },
  { type: "error", name: "SessionTaken", inputs: [{ type: "address", name: "sessionKey" }] },
  { type: "error", name: "BadSignature", inputs: [] },
  { type: "error", name: "AlreadyPosted", inputs: [] },
  { type: "error", name: "BodyTooLong", inputs: [{ type: "uint256", name: "length" }] },
  { type: "error", name: "UnknownRoom", inputs: [{ type: "uint256", name: "roomId" }] },
] as const;

/** EIP-712 domain and types shared by the wallet, session key and CollectChat. */
export const chatDomain = { name: "CollectChat", version: "1", chainId: appChain.id, verifyingContract: chatAddress } as const;
/** The previous chat contract, read-only, so its history still shows. */
export const chatV1Address = ((deployed as { collectChatV1?: string }).collectChatV1 ?? zeroAddress) as Address;
export const chatTypes = {
  Register: [
    { name: "owner", type: "address" },
    { name: "sessionKey", type: "address" },
    { name: "expiry", type: "uint64" },
    { name: "chatKey", type: "bytes32" },
    { name: "nonce", type: "uint256" },
  ],
  Session: [
    { name: "owner", type: "address" },
    { name: "expiry", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
  Post: [
    { name: "roomId", type: "uint256" },
    { name: "bodyHash", type: "bytes32" },
    { name: "salt", type: "bytes32" },
  ],
} as const;
