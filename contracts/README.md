# Grailio contracts

- `src/CollectPacks.sol`: $1 USDC packs whose cards hold real BNB Chain tokens, and the USDC prize pool behind them.
- `src/CollectMarket.sol`: peer-to-peer card market. Each listing is priced in BNB or USDC, the seller's choice.
- `src/CollectPoints.sol`: non-transferable points, 1 per $1 pack. Not a token.
- `src/CollectDAO.sol`: proposals and votes weighted by points.
- `src/CollectChat.sol`: on-chain community chat. An open lounge, plus an encrypted room per token for holders of a card of that token.
- `src/CollectNames.sol`, `src/CollectProfiles.sol`: usernames, and card avatars with a bio and socials (users pay their own gas).

## Community

- **Rooms:** the deploy script creates "The lounge" (open to any registered wallet) and `$BTC`, `$ETH`, `$WBNB`, `$LINK`, `$CAKE`. To read and post in a token room you need at least one card of that token; the pack contract keeps a per-wallet count (`heldOf`) the chat contract checks on every post. Sell or redeem the card and access goes with it.
- **Gasless, trustless:** a wallet signs once to authorise a browser session key and publish its chat key. Each message is signed by that session key, and the app's relayer (`/api/chat/relay`) pays the gas. It can't forge, change or read messages, and wallets can always `post` directly if the relayer is down.
- **Encryption:** token-room messages are encrypted to each current holder's chat key, so only holders can read them.
- **Moderation:** the moderator (the deployer at launch) can `setMuted`. Messages are events and can't be deleted; the app hides muted accounts.
- **Relay costs:** about $0.003 per message at normal gas. The relay caps each wallet at 6 posts a minute and 300 a day, everyone at `RELAY_DAILY_LIMIT` (3,000/day) and gas at `RELAY_MAX_GWEI` (50). It simulates every transaction first, so refused posts cost nothing. Fund `RELAYER_KEY`'s wallet with a little BNB and top it up; it refuses below 0.01 BNB.

## Points and DAO

- **Points are not a token.** There's no transfer, approve or sell. Only approved contracts (`setAwarder`) can award them; the pack contract awards `pointsPerPack` (1) per pack bought. The owner can change the rate or disconnect points with `packs.setPoints`.
- **Snapshots:** balances are checkpointed by block. A vote counts the points the voter held at the block before the proposal was made, so buying packs mid-vote doesn't change the result.
- **Proposing** needs `proposalThreshold` points (5). Voting lasts `votingPeriod` (3 days). Votes are For, Against or Abstain.
- **Passing:** turnout must reach `quorumBps` (10%) of all points at the snapshot, rounded up, and For must beat Against.
- **Signal only.** Results are recorded on chain, but nothing executes automatically: points cost about $1 each, so a wealthy wallet could buy a majority. Binding treasury spending can be added later.
- **Owner (guardian)** can cancel spam proposals and tune `setParams(votingPeriod, quorumBps, proposalThreshold)`. Proposers can cancel their own.

## Marketplace

- **Non-custodial.** A listed card stays in the seller's wallet until it sells. The seller approves the market once (`setApprovalForAll`). A listing dies on its own if the card is moved, redeemed or the approval is revoked.
- **Currency:** the seller lists in BNB or USDC (`list(nft, id, price, inAvax, expiresAt)`). The buyer pays in that currency and the seller receives it directly; nothing is swapped.
- **Buying:** `buy(nft, id, inAvax, maxPrice)`. BNB listings: send exactly the price as the transaction value, no approval needed. USDC listings: approve the market first. Passing `inAvax` means a seller can't switch currency on a buyer at the last second, and `maxPrice` protects against a last-second price change.
- **Fee:** 1% on both currencies by default, capped at 10% (`setFee`).
  - USDC fees go straight to `treasury`, which the deploy script points at the pack contract, so you withdraw them on `/treasury` as pool surplus.
  - BNB fees collect in the market contract (the pack pool can't take BNB). The owner sends them out with `withdrawAvaxFees(to)`, also on `/treasury`. That's the only money the market ever holds.
- **Listings** last 1 hour to 30 days. Sellers can `relist` (change price, currency or expiry) or `cancel`. Anyone can `clearInvalid` dead listings.
- A seller wallet that can't receive BNB can't complete an BNB sale; the purchase reverts and nothing moves.
- The only NFT transfer the market can ever make is seller → buyer, for that seller's own valid listing.

## How the money works

- **Buy:** the player pays the tier price (1 USDC) into the contract.
- **Open:** the next block's hash rolls a token and rarity. The contract swaps the card's value from USDC into that token (PancakeSwap v3, through WBNB) and locks it in the card NFT. The swap must return at least the Chainlink fair amount minus that token's tolerance. If it can't, the card holds the USDC instead, and anyone can `fill(cardId)` later.
- **Redeem:** the player burns the card and receives its tokens (or its USDC if it was never filled).
- **Gift:** `buyGift(tierId, quantity, signer)` pays like `buy`, but holds the packs for whoever has the gift code (the buyer gets the points). The code is a secret whose key's address is `signer`; `giftIdOf(signer)` finds the gift. `claimGift(giftId, signature)` needs that key to sign `giftMessage(giftId, claimer)`, so a copied claim can't be redirected. Packs get their reveal block when claimed, so nobody can know the result in advance or re-roll by gifting. The buyer can `cancelGift` an unclaimed gift to take the packs. Claiming works while paused, so claimed packs can still be refunded.
- **Owed to players** (`reserved()`) = the top prize of every unopened pack + USDC held by unfilled cards. A sale that would leave the pool short reverts.
- **Withdrawable** (`surplus()`) = USDC held − owed. This is the only USDC the owner can ever take. Tokens locked in cards can't be withdrawn or rescued.

## Treasury controls (owner only)

| Function | What it does |
| --- | --- |
| `withdraw(to, amount)` | Send up to `surplus()` USDC to `to` |
| `withdrawAll(to)` | Send the whole surplus |
| `pause()` / `unpause()` | Stop / resume sales. Opening always works. While paused, buyers can `refund(packId)` unopened packs for what they paid |
| `rescue(token, to)` | Recover tokens sent by mistake (never USDC, never locked card tokens) |
| `transferOwnership(newOwner)` | Two-step: `newOwner` must call `acceptOwnership()` |

These controls are also on the app's `/treasury` page for the owner wallet.

**To get all money out:** pause, wait for or ask players to open or refund their packs, then `withdrawAll`. When nothing is owed, the whole pool is surplus.

## Deploy (you run this; it spends real BNB and USDC)

> **USDC decimals.** `CollectPacks` reads the payment token's decimals at deploy, so it
> works with BNB Chain's 18-decimal USDC (`0x8AC7…580d`). USDC amounts are uint128, and
> `MainnetConfig.addTiers` uses 18-decimal amounts; `deploy()` checks that USDC really has
> 18 decimals. The unit tests run the pack suite at both 6 and 18 decimals. This is a
> real-money contract change: have it reviewed and run the fork test (`BSC_RPC_URL`) first, then:

Contracts compile with `via_ir = true` (`foundry.toml`): it keeps `CollectPacks` under the 24 KB deploy limit. Tests read the block with `vm.getBlockNumber()` / `vm.getBlockTimestamp()`, since `via_ir` can cache `block.number` inside a test.

```bash
# 0. Fetch the pinned Solidity libraries into lib/ (once)
./install-libs.sh

# 1. Make a new deployer wallet, stored encrypted (prompts for a password, prints the address)
cast wallet new ~/.foundry/keystores grailio-mainnet-deployer
#    (to use a key you already have: cast wallet import grailio-mainnet-deployer --interactive)

# 2. Tests: unit, then against a BSC mainnet fork (nothing is sent)
forge test
BSC_RPC_URL=https://bsc-dataseed.bnbchain.org forge test --match-contract Fork -vv

# 3. Dry run against mainnet (nothing is sent)
BSC_RPC_URL=https://bsc-dataseed.bnbchain.org forge script script/DeployCollectPacks.s.sol --rpc-url bsc --account grailio-mainnet-deployer

# 4. Deploy for real and verify on BscScan (Etherscan API v2 key).
#    Add NEW_OWNER=0x… to hand ownership to a Safe.
ETHERSCAN_API_KEY=... BSC_RPC_URL=https://bsc-dataseed.bnbchain.org forge script script/DeployCollectPacks.s.sol --rpc-url bsc --account grailio-mainnet-deployer --broadcast --verify

# 5. If verification didn't finish (it can time out), verify what's deployed. Safe to re-run.
ETHERSCAN_API_KEY=... BSC_RPC_URL=https://bsc-dataseed.bnbchain.org ./script/verify.sh
```

The broadcast writes every address to `../deployments/56.json`. Rebuild the app afterwards: `/packs`, `/marketplace`, `/treasury`, `/dao` and `/community` go live (set `RELAYER_KEY` for free posting). Seed the pack pool with USDC before the first sale.

## Add stock assets (Atlas)

Cards can hold tokenized stocks (bStocks) priced by Atlas Oracle. Atlas serves every feed from one MultiFeed contract (`0xeace519e…44aa`, `fetchBatch(bytes4[] feedIds)` → `(value, timestamp, updatedAt)[]`, 18 decimals). `src/AtlasFeedAdapter.sol` wraps one feed ID in the Chainlink interface CollectPacks already uses; it reports Atlas's real report timestamp, and a missing price reads as 0, so the card keeps its USDC until `fill`.

1. Edit `script/stocks.mainnet.json`: one entry per stock (token, Atlas feed ID, slippage, a route from USDC). Delete each entry's `todo` field once checked; the script refuses to run while any is left.
2. Fork test: `BSC_RPC_URL=https://bsc-dataseed.bnbchain.org forge test --match-contract AtlasStocksFork -vv` (adds the stocks to the live contract on a fork and opens a Low pack with each).
3. Dry run as the owner (nothing is sent):
   ```bash
   BSC_RPC_URL=https://bsc-dataseed.bnbchain.org forge script script/AddStocks.s.sol --rpc-url bsc --account <owner keystore>
   ```
4. Broadcast (owner `0x073d…547F`). Add `DISABLE_CRYPTO=1` to also switch off the five crypto assets (IDs 0-4):
   ```bash
   ETHERSCAN_API_KEY=... BSC_RPC_URL=https://bsc-dataseed.bnbchain.org forge script script/AddStocks.s.sol --rpc-url bsc --account <owner keystore> --broadcast --verify
   ```

The script prints each adapter and new asset ID and writes them to `../deployments/56.json` under `stockAssets`. **The app needs those asset IDs** (card ticker, logo and price per asset ID); until it knows them, stock cards show up as unknown assets.

**Feed age.** Atlas pushes bStock prices about every 60 seconds around the clock, not only in US market hours (measured on chain on 2026-11-26, a US holiday). The default `maxFeedAge` is 6 hours: if Atlas stops, swaps stop within hours and cards keep their USDC until `fill`, instead of buying at an old price.

### Then add a chat room per stock

Each stock gets an encrypted room on CollectChat, gated by holding a card of that stock (like the BTC–CAKE rooms). Safe to re-run; it skips stocks that already have a room.

```bash
# dry run
forge script script/AddStockRooms.s.sol --rpc-url bsc --sender <owner>
# for real
forge script script/AddStockRooms.s.sol --rpc-url bsc --account <owner keystore> --broadcast
```

## Before the first sale

- **Seed the pool.** Send USDC to the contract address. Each unopened pack reserves its top prize: $0.95 Ember, $4.00 Flare, $10.13 Nova. `capacity(tierId)` shows how many more can sell. Withdraw the seed any time it isn't owed.
- **Start small.** Test with a few dollars and your own wallets first.
- **Get a review.** The contract has unit and fork tests but no external audit yet. Have a paid-prize/gambling check done for your users' locations.

Mainnet addresses (tokens, Chainlink feeds, PancakeSwap routers and pool fee tiers) and per-token tolerances are in `script/MainnetConfig.sol`, all checked on chain 56 on 2026-11-26.
