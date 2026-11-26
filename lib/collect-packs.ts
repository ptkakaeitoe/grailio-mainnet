import { zeroAddress, type Address } from "viem";

import deployment from "@/deployments/56.json";

/**
 * CollectPacks (contracts/src/CollectPacks.sol): $1 USDC packs whose cards hold
 * real tokens, plus the USDC prize pool and its treasury controls. Written into
 * deployments/56.json by contracts/script/DeployCollectPacks.s.sol.
 */
export const collectPacksAddress = ((deployment as { collectPacks?: string }).collectPacks ?? zeroAddress) as Address;
export const collectPacksLive = collectPacksAddress !== zeroAddress;

/** Treasury surface: reads plus owner-only actions. */
export const collectPacksTreasuryAbi = [
  { type: "function", name: "owner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "pendingOwner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "paused", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "surplus", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "reserved", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "packReserve", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "pendingUsdc", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "nextPackId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "nextCardId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "pendingRevenue", inputs: [], outputs: [{ type: "int256" }], stateMutability: "view" },
  { type: "function", name: "distributable", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "stakingBps", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "daoBps", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "distribute", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "withdraw", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "withdrawAll", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "pause", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "unpause", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "acceptOwnership", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "error", name: "ExceedsSurplus", inputs: [{ type: "uint256", name: "requested" }, { type: "uint256", name: "surplus" }] },
  { type: "error", name: "OwnableUnauthorizedAccount", inputs: [{ type: "address", name: "account" }] },
  { type: "error", name: "ZeroAddress", inputs: [] },
] as const;

/** Card side of CollectPacks: ERC-721 (enumerable) cards that hold tokens. */
export const collectCardsAbi = [
  { type: "function", name: "cards", inputs: [{ type: "uint256" }], outputs: [{ type: "uint8", name: "asset" }, { type: "uint8", name: "tier" }, { type: "uint8", name: "rarity" }, { type: "bool", name: "filled" }, { type: "uint128", name: "usd" }, { type: "uint256", name: "amount" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "tokenOfOwnerByIndex", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "ownerOf", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "isApprovedForAll", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "redeemedOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256[]" }], stateMutability: "view" },
  { type: "function", name: "setApprovalForAll", inputs: [{ type: "address" }, { type: "bool" }], outputs: [], stateMutability: "nonpayable" },
] as const;

/** CollectStaking (contracts/src/CollectStaking.sol): stake cards for a share of revenue, paid with a 7-day half-life. */
export const collectStakingAddress = ((deployment as { collectStaking?: string }).collectStaking ?? zeroAddress) as Address;
export const collectStakingLive = collectPacksLive && collectStakingAddress !== zeroAddress;

/** Rarity weight in CollectStaking.weightOf: Common 1, Rare 2, Epic 4, Legendary 10. */
export const STAKE_WEIGHTS = [1, 2, 4, 10] as const;

export const collectStakingAbi = [
  { type: "function", name: "stake", inputs: [{ type: "uint256[]" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "unstake", inputs: [{ type: "uint256[]" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "claim", inputs: [{ type: "uint256[]" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "sync", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "pending", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "stakedBy", inputs: [{ type: "address" }], outputs: [{ type: "uint256[]" }], stateMutability: "view" },
  { type: "function", name: "stakes", inputs: [{ type: "uint256" }], outputs: [{ type: "address", name: "owner" }, { type: "uint64", name: "since" }], stateMutability: "view" },
  { type: "function", name: "payoutPerDay", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "poolNow", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalWeight", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "error", name: "NotYourCard", inputs: [{ type: "uint256" }] },
  { type: "error", name: "NoCards", inputs: [] },
] as const;

/** Card asset ID = index in contracts/script/stocks.mainnet.json. */
export { tickerForAsset } from "@/lib/stock-assets";

/** CollectMarket (contracts/src/CollectMarket.sol): non-custodial card market, each listing priced in BNB or USDC. */
export const collectMarketAddress = ((deployment as { collectMarket?: string }).collectMarket ?? zeroAddress) as Address;
export const collectMarketLive = collectPacksLive && collectMarketAddress !== zeroAddress;

export const collectMarketAbi = [
  { type: "function", name: "allListings", inputs: [], outputs: [{ type: "address[]" }, { type: "uint256[]" }, { type: "address[]" }, { type: "uint256[]" }, { type: "bool[]" }, { type: "uint64[]" }], stateMutability: "view" },
  { type: "function", name: "isValid", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "feeBps", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "list", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bool" }, { type: "uint64" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "relist", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bool" }, { type: "uint64" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "cancel", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "buy", inputs: [{ type: "address" }, { type: "uint256" }, { type: "bool" }, { type: "uint256" }], outputs: [], stateMutability: "payable" },
  { type: "function", name: "owner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "avaxFees", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "withdrawAvaxFees", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "error", name: "PriceAboveMax", inputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "error", name: "ListingInvalid", inputs: [{ type: "address" }, { type: "uint256" }] },
  { type: "error", name: "ListingExpired", inputs: [{ type: "address" }, { type: "uint256" }] },
  { type: "error", name: "OwnListing", inputs: [{ type: "address" }, { type: "uint256" }] },
  { type: "error", name: "NotApproved", inputs: [{ type: "address" }] },
  { type: "error", name: "BadExpiry", inputs: [{ type: "uint256" }] },
  { type: "error", name: "WrongCurrency", inputs: [] },
  { type: "error", name: "BadValue", inputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "error", name: "AvaxTransferFailed", inputs: [] },
] as const;

/** Buying and opening packs on CollectPacks. */
export const collectPacksAbi = [
  { type: "function", name: "buy", inputs: [{ type: "uint256", name: "tierId" }, { type: "uint256", name: "quantity" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "open", inputs: [{ type: "uint256", name: "packId" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  /** Gifts: packs held for whoever has the gift code (see lib/gift-code.ts). */
  { type: "function", name: "buyGift", inputs: [{ type: "uint256", name: "tierId" }, { type: "uint256", name: "quantity" }, { type: "address", name: "signer" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "claimGift", inputs: [{ type: "uint256", name: "giftId" }, { type: "bytes", name: "signature" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "cancelGift", inputs: [{ type: "uint256", name: "giftId" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "giftMessage", inputs: [{ type: "uint256", name: "giftId" }, { type: "address", name: "to" }], outputs: [{ type: "bytes32" }], stateMutability: "view" },
  { type: "function", name: "gifts", inputs: [{ type: "uint256" }], outputs: [{ type: "address", name: "from" }, { type: "address", name: "signer" }, { type: "uint8", name: "tier" }, { type: "uint8", name: "quantity" }, { type: "bool", name: "done" }, { type: "uint128", name: "paid" }], stateMutability: "view" },
  { type: "event", name: "GiftBought", inputs: [{ type: "uint256", name: "giftId", indexed: true }, { type: "address", name: "from", indexed: true }, { type: "uint256", name: "tierId", indexed: true }, { type: "uint256", name: "quantity", indexed: false }, { type: "address", name: "signer", indexed: false }] },
  { type: "error", name: "GiftDone", inputs: [] },
  { type: "error", name: "BadGiftCode", inputs: [] },
  { type: "error", name: "NotYourGift", inputs: [] },
  { type: "error", name: "GiftCodeUsed", inputs: [] },
  { type: "function", name: "giftIdOf", inputs: [{ type: "address", name: "signer" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  /** Burn a card for what it holds: its tokens, or its USDC if never filled. */
  { type: "function", name: "redeem", inputs: [{ type: "uint256", name: "cardId" }], outputs: [], stateMutability: "nonpayable" },
  /** Swap an unfilled card's USDC into its token (anyone may call). */
  { type: "function", name: "fill", inputs: [{ type: "uint256", name: "cardId" }], outputs: [], stateMutability: "nonpayable" },
  { type: "error", name: "SwapUnavailable", inputs: [] },
  { type: "error", name: "NotYourCard", inputs: [] },
  { type: "error", name: "AlreadyFilled", inputs: [] },
  { type: "function", name: "packIdsOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256[]" }], stateMutability: "view" },
  { type: "function", name: "packs", inputs: [{ type: "uint256" }], outputs: [{ type: "address", name: "owner" }, { type: "uint64", name: "revealBlock" }, { type: "uint8", name: "tier" }, { type: "bool", name: "done" }, { type: "uint128", name: "paid" }], stateMutability: "view" },
  { type: "function", name: "capacity", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "paused", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "event", name: "PackOpened", inputs: [
    { type: "uint256", name: "packId", indexed: true }, { type: "uint256", name: "cardId", indexed: true }, { type: "address", name: "owner", indexed: true },
    { type: "uint8", name: "asset", indexed: false }, { type: "uint8", name: "rarity", indexed: false }, { type: "uint128", name: "usd", indexed: false }, { type: "bool", name: "expired", indexed: false },
  ] },
  { type: "event", name: "CardFilled", inputs: [{ type: "uint256", name: "cardId", indexed: true }, { type: "uint256", name: "amount", indexed: false }] },
  { type: "error", name: "PoolTooSmall", inputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "error", name: "RevealNotReady", inputs: [] },
  { type: "error", name: "PackDone", inputs: [] },
  { type: "error", name: "NotYourPack", inputs: [] },
  { type: "error", name: "BadQuantity", inputs: [] },
  { type: "error", name: "BadTier", inputs: [] },
  { type: "error", name: "EnforcedPause", inputs: [] },
] as const;

/** A pack must be opened within this many blocks of its reveal block, or it opens as its tier's lowest card. */
export const REVEAL_WINDOW = 256;

/** CollectPacks.tier(id): price, odds, backing and whether it's switched on. */
export const collectPacksTierAbi = [
  {
    type: "function", name: "tier", stateMutability: "view", inputs: [{ type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { type: "uint128", name: "price" }, { type: "uint16[4]", name: "oddsBps" }, { type: "uint128[4]", name: "backing" }, { type: "bool", name: "active" },
    ] }],
  },
] as const;
