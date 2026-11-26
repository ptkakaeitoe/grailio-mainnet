# Grailio (BNB Smart Chain mainnet)

The mainnet version of Grailio: open $1 packs, collect cards that hold real tokens, trade them, vote and chat, on **BNB Smart Chain (chain 56)**. It is a separate Next.js app with its own Foundry contracts, kept apart from the testnet app in the repo root (`src/`, `contracts/`, `openfour/`). Nothing here imports from there.

**Status: the app runs and builds; the contracts are not deployed.** Until `deployments/56.json` has addresses, on-chain pages show demo mode or an "at launch" state. Swaps on `/trade` are already real (KyberSwap's BSC aggregator; the user's wallet signs).

## Run it

```bash
cd mainnet
cp .env.example .env.local     # fill in the values (see below)
npm install
npm run dev -- -p 3300         # any free port; the testnet app uses 3200
```

Checks: `npm run build`, `npm run lint`, `npx tsc --noEmit`, `node --test tests/*.mjs`, and for the contracts `cd contracts && ./install-libs.sh && forge test`.

This Next.js version has breaking changes from older releases: read `AGENTS.md` and `node_modules/next/dist/docs/` before changing code.

## Pages

| Route | What |
| --- | --- |
| `/` | Live prices, packs, get started |
| `/packs` | Buy and open $1 packs (three designs, three risk levels) |
| `/trade` | Real swaps via KyberSwap at the best BSC DEX route |
| `/marketplace` | Buy and sell cards, priced in BNB or USDC |
| `/collection` | Your cards (stake, redeem, view) and unopened packs |
| `/gift` | Claim a gift code; see and cancel gifts you sent |
| `/profile`, `/@handle` | Username, picture, bio, socials, ID card and holdings |
| `/dao` | Proposals and votes with collector points (1 per pack bought) |
| `/community` | Open lounge plus an encrypted room per token for its card holders |
| `/treasury` | Owner: pack pool, what's owed, withdraw, pause |
| `/info` | Field guide and contract table |
| `/v2` | Minimal black-and-white test UI over the same code |

Cards hold BTCB, ETH, WBNB, LINK or CAKE (1 in 5 each). Payments are in USDC (and BNB on the marketplace). DAO votes use non-transferable points; there is no Grailio token.

## How it works

### Packs

Every pack costs **$1 in USDC** and earns **1 DAO point**. Each card holds one random token: BTCB, ETH, WBNB, LINK or CAKE, 1 in 5 each. Gas is paid in BNB. The three $1 tiers that `contracts/script/MainnetConfig.sol` adds:

| Pack (risk) | Common | Rare | Epic | Legendary | Average in tokens |
| --- | --- | --- | --- | --- | --- |
| Low (tier 0) | 50% · $0.95 | 25% · $0.95 | 20% · $0.95 | 5% · $0.95 | $0.95 (5% edge) |
| Medium (tier 1) | 50% · $0.46 | 25% · $0.80 | 20% · $1.40 | 5% · $4.00 | $0.91 (9% edge) |
| High (tier 2) | 60% · $0.20 | 25% · $0.60 | 12% · $2.80 | 3% · $10.13 | $0.91 (9% edge) |

In the Low pack every card holds the same $0.95; rarity only sets the card's staking multiplier. `PACK_TIERS` in `lib/contracts.ts` also lists $3 and $5 packs (tiers 3 to 9); those are not added by `MainnetConfig.sol` and would have to be added on chain in id order.

**Where the $1 goes:** into the pack contract's USDC pool. When a pack opens, the contract swaps the card's value from USDC into its token on PancakeSwap v3 (USDC → WBNB through the 0.01% pool, then WBNB → token through that token's deepest WBNB pool) and locks it in the card. Each swap must return at least the Chainlink fair amount minus that asset's slippage limit (1.5% BTCB and WBNB, 2% ETH, 4% LINK and CAKE); if it can't, the card is minted holding its value in USDC and anyone can `fill` it later. The difference between the price and the card value is profit, which `distribute()` shares out to staking and the DAO. The owner can only withdraw USDC above what unopened packs and unfilled cards could still pay out, and never tokens locked in cards. Odds live in `PACK_TIERS` (`lib/contracts.ts`) and `contracts/script/MainnetConfig.sol`.

### Prices (`lib/quotes.ts`)

- **Live price:** read on chain from pinned PancakeSwap v3 pools (WBNB/USDC, then BTCB, ETH, LINK and CAKE against WBNB, converted to USD through the WBNB/USDC pool), cached for 30 seconds. USDC is treated as $1.
- **24h change and charts:** GeckoTerminal for the same pools, cached for 60 seconds.
- The LINK and CAKE pools are thinner; the pack contract prices fills with Chainlink, not these pools.

### Swaps (`/trade`)

KyberSwap routes each trade across BSC DEXes (`lib/kyber.ts`). `GET /api/swap/quote` returns the route; `POST /api/swap/build` returns calldata (beta cookie required, slippage capped at 5%). The user's wallet signs; the server never signs or sends. Every swap must target KyberSwap's router, checked on the server and in the browser. Grailio takes a 0.5% fee inside each swap (`lib/swap-fee.ts`): when USDC is on either side, half goes to staking and half to the treasury wallet; otherwise all of it goes to the treasury.

### Beta gate

Anyone can browse and use demo mode. **Connecting a wallet needs a beta code.** The code is checked on the server, which sets a signed httpOnly cookie for 90 days; wallets that connect without it are signed out. This is a UI gate: contracts on a public chain can still be called directly.

## Environment

Names are in `.env.example`; you fill in the values. Never commit `.env.local`.

| Variable | Needed for | Required? |
| --- | --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Sign-in (Privy). Enable BNB Smart Chain and add your domain in the Privy dashboard | Yes for production; local dev falls back to a browser wallet |
| `BETA_ACCESS_CODES`, `BETA_COOKIE_SECRET` | The beta gate for connecting wallets | Yes |
| `ETHERSCAN_API_KEY` | Activity and chat history (contract logs via Etherscan API v2, chain 56). The key needs BNB Chain access | Yes once contracts are deployed |
| `RELAYER_KEY` | Free chat posts and gift gas top-ups (a dedicated wallet with a little BNB) | Optional |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared relay limits (or Vercel KV) | Required in production if `RELAYER_KEY` is set |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Mobile wallets via WalletConnect | Optional |
| `NEXT_PUBLIC_BSC_RPC_URL` | Your own RPC instead of `bsc-dataseed.bnbchain.org` | Optional, recommended |
| `NEXT_PUBLIC_SITE_URL` | Deployed origin, for link previews | Optional |
| `NEXT_PUBLIC_TESTNET_URL` | The testnet app's URL, linked from the Testnet / Mainnet beta switch in the connect panel (shown as unavailable when unset) | Optional |

## Mainnet addresses it uses

**Grailio contracts: none yet.** `deployments/56.json` holds zero addresses until you deploy. The earlier app's deployed contracts live on a different chain and do not exist on BSC, so none are copied.

Third-party contracts, all read on chain 56 on 2026-11-26 (`lib/tokens.ts`, `lib/quotes.ts`, `contracts/script/MainnetConfig.sol`):

| What | Address |
| --- | --- |
| USDC (Binance-Peg, **18 decimals**) | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| BTCB | `0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c` |
| ETH (Binance-Peg) | `0x2170Ed0880ac9A755fd29B2688956BD959F933F8` |
| LINK | `0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD` |
| CAKE | `0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82` |
| Chainlink BTC/USD, ETH/USD, BNB/USD, LINK/USD, CAKE/USD | `0x2649…5Ebf`, `0x9ef1…5b2e`, `0x0567…2aeE`, `0xca23…fac8`, `0xB606…65a1` (full addresses in `MainnetConfig.sol`) |
| PancakeSwap v3 SmartRouter / v2 Router | `0x13f4EA83D0bd40E75C8222255bc855a974568Dd4` / `0x10ED43C718714eb63d5aA57B78B54704E256024E` |
| KyberSwap MetaAggregationRouterV2 (swaps may only go here) | `0x6131B5fae19EA4f9D964eAc0408E4408b66337b5` |
| Price pools (PancakeSwap v3) | WBNB/USDC 0.01% `0xf268…12C4`, BTCB/WBNB 0.05% `0x6bbc…d636`, ETH/WBNB 0.05% `0xD0e2…8CBA`, LINK/WBNB 0.25% `0x0E18…94b9`, CAKE/WBNB 0.25% `0x133B…96BF` |

The swap-fee treasury wallet in `lib/swap-fee.ts` (`SWAP_FEE_TREASURY`) is carried over from the earlier app; change it to your own wallet before taking swaps.

## What is left for you

1. **Review the 18-decimal USDC change** to `CollectPacks` (it now reads USDC's decimals; unit tests cover 6 and 18) and run the fork test with `BSC_RPC_URL` set. It's a real-money contract: have it reviewed before deploying.
2. **Deploy the contracts yourself** (spends real BNB): the exact commands are in [`contracts/README.md`](contracts/README.md#deploy-you-run-this-it-spends-real-bnb-and-usdc). The script writes every address into `deployments/56.json`; rebuild the app afterwards and seed the pack pool with USDC.
3. **Fill in `.env.local`** (or your host's env): Privy app ID with BNB Smart Chain enabled, beta codes and cookie secret, an Etherscan API v2 key, and optionally a relayer wallet with a little BNB plus Upstash.
4. **Set `SWAP_FEE_TREASURY`** in `lib/swap-fee.ts` to your wallet.
5. **Optional: outside NFTs as profile pictures.** BNB Chain has no keyless NFT index, so the picker offers Grailio cards only. Plug an NFT indexer into `lib/nft-metadata.ts` to bring this back.

## What changed from the earlier app

Branding is now Grailio. Behaviour is the same, moved to BNB Chain: chain, RPC and explorer (BscScan); tokens and price pools (PancakeSwap v3 instead of the old chain's DEXes); KyberSwap's BSC endpoint; contract logs through the Etherscan v2 API; USD amounts formatted with USDC's on-chain decimals; gas top-ups sized for BSC fees; token icons for BNB and CAKE; outside-NFT avatars switched off.

## Stack

Next.js 16 (App Router), React 19, wagmi 2, viem 2, Privy, Tailwind CSS 4, Foundry, OpenZeppelin 5.4.
