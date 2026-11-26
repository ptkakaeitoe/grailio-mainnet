# Grailio (BNB Smart Chain mainnet)

The mainnet version of Grailio: open $1 packs, collect cards that hold tokenized stocks, trade them, vote and chat, on **BNB Smart Chain (chain 56)**. It is a separate Next.js app with its own Foundry contracts, kept apart from the testnet app in the repo root (`src/`, `contracts/`, `openfour/`). Nothing here imports from there.

**Status: the contracts are deployed on BNB Smart Chain mainnet** (addresses in `deployments/56.json`, listed below). Low packs of all three editions are on sale; Medium and High open once the pool holds USDC. Swaps on `/trade` are real (KyberSwap's BSC aggregator; the user's wallet signs).

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
| `/trade` | Tokenized stocks for USDT, USDC or BNB, swapped via KyberSwap at the best BSC DEX route |
| `/marketplace` | Buy and sell cards, priced in BNB or USDC, with a Stock filter |
| `/collection` | Your cards (stake, redeem, view) and unopened packs |
| `/gift` | Claim a gift code; see and cancel gifts you sent |
| `/profile`, `/@handle` | Username, picture, bio, socials, ID card and holdings |
| `/dao` | Proposals and votes with collector points (1 per pack bought) |
| `/community` | Open lounge plus an encrypted room per stock for its card holders |
| `/treasury` | Owner: pack pool, what's owed, withdraw, pause |
| `/info` | Field guide and contract table |
| `/v2` | Minimal black-and-white test UI over the same code |

Cards hold tokenized stocks (bStocks, issued by bStocks), listed in `lib/stock-assets.ts` and priced on chain by Atlas Oracle. Payments are in USDC (and BNB on the marketplace). DAO votes use non-transferable points; there is no Grailio token.

## How it works

### Packs

Packs come in three editions, each with Low, Medium and High risk. Every pack earns **1 DAO point** (whatever its price), and each card holds one tokenized stock from **its edition's basket** (`baskets` in `contracts/script/stocks.mainnet.json`):

| Edition | Price | Basket | Tiers (Low / Medium / High) |
| --- | --- | --- | --- |
| Fable | $1 | NVDA, AAPL, TSLA, GOOGL, AMZN | 0 / 1 / 2 |
| Saga | $3 | SPY, QQQ, BABA, NFLX, EWJ | 3 / 4 / 5 |
| Mythos | $5 | SPCX, ANT, SKHY, EWY, EWT | 6 / 7 / 8 |

Odds and card values per $1 of price (Saga is ×3, Mythos ×5), as `contracts/script/MainnetConfig.sol` adds them:

| Risk | Common | Rare | Epic | Legendary | Average in tokens |
| --- | --- | --- | --- | --- | --- |
| Low | 50% · $0.95 | 25% · $0.95 | 20% · $0.95 | 5% · $0.95 | $0.95 (5% edge) |
| Medium | 50% · $0.46 | 25% · $0.80 | 20% · $1.40 | 5% · $4.00 | $0.91 (9% edge) |
| High | 60% · $0.20 | 25% · $0.60 | 12% · $2.80 | 3% · $10.13 | $0.91 (9% edge) |

In a Low pack every card holds the same 95% of the price; rarity only sets the card's staking multiplier. The deploy puts the three Low tiers on sale; Medium and High need a seeded pool and are switched on later (`setTierActive`). Gas is paid in BNB.

**Where the money goes:** into the pack contract's USDC pool. When a pack opens, the block hash rolls a rarity and picks a stock uniformly from the tier's basket (active assets only), swaps the card's value from USDC into that bStock on PancakeSwap v3 (USDC → USDT → bStock, routes in `stocks.mainnet.json`) and locks it in the card. Each swap must return at least the Atlas fair amount (read through that stock's `AtlasFeedAdapter`, a Chainlink-style interface) minus its slippage limit (3%). If the Atlas price is older than 6 hours or the swap would come up short, the card is minted holding its value in USDC and anyone can `fill` it later. The difference between the price and the card value is profit, which `distribute()` shares out to staking and the DAO. Staking rewards are paid in USDC. The owner can only withdraw USDC above what unopened packs and unfilled cards could still pay out, and never tokens locked in cards. Odds live in `PACK_TIERS` (`lib/contracts.ts`) and `contracts/script/MainnetConfig.sol`.

### Prices (`lib/quotes.ts`)

- **Stocks:** price read on chain from Atlas Oracle's MultiFeed (`0xEAcE…44aa`, `fetch(feedId)`, `lib/atlas.ts`), cached for 30 seconds; 24h change and charts from Yahoo Finance, ending on the Atlas price. The pack contract uses the same Atlas feeds.
- **BNB:** read on chain from the PancakeSwap v3 WBNB/USDC pool, in the same 30-second cache; 24h change from GeckoTerminal for that pool. USDC is treated as $1.
- **Adding a stock:** one line in `lib/stock-assets.ts` (asset ID, ticker, name, token address, decimals, Atlas feed ID, accent). Logos are `public/logos/{TICKER}B.png`.

### Swaps (`/trade`)

The tradable tokens are the 15 stocks in `lib/stock-assets.ts`, paid or received in USDT, USDC or BNB (`SWAP_KEYS` in `lib/tokens.ts`). KyberSwap routes each trade across BSC DEXes (`lib/kyber.ts`). `GET /api/swap/quote` returns the route; `POST /api/swap/build` returns calldata (beta cookie required, slippage capped at 5%). The user's wallet signs; the server never signs or sends. Every swap must target KyberSwap's router, checked on the server and in the browser. Grailio takes a 0.5% fee inside each swap (`lib/swap-fee.ts`): when USDC is on either side, half goes to staking and half to the treasury wallet; otherwise all of it goes to the treasury.

### Beta gate

Anyone can browse, use demo mode, connect a wallet, swap and chat: the beta gate is **off** (`BETA_GATE_ON = false` in `lib/beta-gate.ts`). To bring it back, set that to `true` and fill `BETA_ACCESS_CODES` / `BETA_COOKIE_SECRET`; the code is then checked on the server, which sets a signed httpOnly cookie for 90 days. It is a UI gate only: contracts on a public chain can always be called directly.

## Environment

Names are in `.env.example`; you fill in the values. Never commit `.env.local`.

| Variable | Needed for | Required? |
| --- | --- | --- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Sign-in (Privy). Enable BNB Smart Chain and add your domain in the Privy dashboard | Yes for production; local dev falls back to a browser wallet |
| `BETA_ACCESS_CODES`, `BETA_COOKIE_SECRET` | The beta gate, only if you turn it back on (`lib/beta-gate.ts`) | No (gate is off) |
| `ETHERSCAN_API_KEY` | Activity and chat history (contract logs via Etherscan API v2, chain 56). The key needs BNB Chain access | Yes |
| `RELAYER_KEY` | Free chat posts and gift gas top-ups (a dedicated wallet with a little BNB) | Optional |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared relay limits (or Vercel KV) | Required in production if `RELAYER_KEY` is set |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Mobile wallets via WalletConnect | Optional |
| `NEXT_PUBLIC_BSC_RPC_URL` | Your own RPC instead of `bsc-dataseed.bnbchain.org` | Optional, recommended |
| `NEXT_PUBLIC_SITE_URL` | Deployed origin, for link previews | Optional |
| `NEXT_PUBLIC_TESTNET_URL` | The testnet app's URL, linked from the Testnet / Mainnet beta switch in the connect panel (shown as unavailable when unset) | Optional |

## Mainnet addresses it uses

**Grailio contracts** (deployed in block 135,875,118; `deployments/56.json`):

| Contract | Address |
| --- | --- |
| CollectPacks | `0xdB862A24350E9fE184c0d1658912d309749D8672` |
| CollectMarket | `0xCCaC8A207a706af3e27B1588c89dD8bE1FD8a094` |
| CollectPoints | `0xf1B0E1872267685f06a5cA4D415229c767758F8E` |
| CollectDAO | `0xC4405f92e6c4EB5d945A1b44E56669D626D453FB` |
| CollectStaking | `0xf67237982494Ce599a1BB051BBe01cAA3cd2256E` |
| CollectChat | `0xC59A85E460221EFeeFF034eCC92Eb09048754e09` |
| CollectNames | `0x380A4b931D1F30dBa598a77a26b99ED30648DF01` |
| CollectProfiles | `0x838C649DC1Ad03ABCC30190edfa71343EbAB7D6c` |
| AtlasFeedAdapter (one per stock) | `stockAssets.<ticker>.adapter` in `deployments/56.json` |

Third-party contracts, all read on chain 56 on 2026-11-26 (`lib/tokens.ts`, `lib/atlas.ts`, `contracts/script/MainnetConfig.sol`, `contracts/script/StockConfig.sol`):

| What | Address |
| --- | --- |
| USDC (Binance-Peg, 18 decimals) | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |
| USDT (Binance-Peg, 18 decimals) | `0x55d398326f99059fF775485246999027B3197955` |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| Atlas Oracle MultiFeed (stock prices) | `0xEAcE519ebB14fB8404fA6DdD23C3b34abaDE44aa` |
| PancakeSwap v3 SmartRouter (card fills) | `0x13f4EA83D0bd40E75C8222255bc855a974568Dd4` |
| KyberSwap MetaAggregationRouterV2 (swaps may only go here) | `0x6131B5fae19EA4f9D964eAc0408E4408b66337b5` |
| BNB price pool (PancakeSwap v3 WBNB/USDC 0.01%) | `0xf2688Fb5B81049DFB7703aDa5e770543770612C4` |
| bStock tokens (15) | `stockAssets.<ticker>.token` in `deployments/56.json` (also `contracts/script/stocks.mainnet.json`) |

The 15 bStocks, by asset ID: NVDA, AAPL, TSLA, GOOGL, AMZN (Fable); SPY, QQQ, BABA, NFLX, EWJ (Saga); SPCX, ANT, SKHY, EWY, EWT (Mythos).

The swap-fee treasury wallet is `SWAP_FEE_TREASURY` in `lib/swap-fee.ts` (`0x9c01…a524`).

## What is left for you

1. **Verify the contracts on BscScan** if any are still unverified: `cd contracts && ETHERSCAN_API_KEY=... BSC_RPC_URL=... ./script/verify.sh` (safe to re-run).
2. **Fund the pack pool with USDC** before switching on Medium and High (`setTierActive`). Each unopened pack reserves its top prize; `capacity(tierId)` shows how many more can sell.
3. **Fill in `.env.local`** (or your host's env): Privy app ID, an Etherscan API v2 key, and optionally a relayer wallet plus Upstash.
4. **Fund the relayer wallet** (`RELAYER_KEY`) with a little BNB and top it up; it refuses below 0.01 BNB.
5. **Privy dashboard:** enable BNB Smart Chain and add your production domain.
6. **Optional: outside NFTs as profile pictures.** BNB Chain has no keyless NFT index, so the picker offers Grailio cards only. Plug an NFT indexer into `lib/nft-metadata.ts` to bring this back.

## What changed from the earlier app

Branding is now Grailio, on BNB Chain: chain, RPC and explorer (BscScan); KyberSwap's BSC endpoint; contract logs through the Etherscan v2 API; USD amounts formatted with USDC's 18 on-chain decimals; gas top-ups sized for BSC fees; outside-NFT avatars switched off. Cards no longer hold crypto (BTCB, ETH, WBNB, LINK, CAKE): they hold 15 bStocks, each pack edition drawing from its own basket of five. Card fills are priced by Atlas Oracle instead of Chainlink and bought on PancakeSwap v3 through USDT. Payments and staking rewards are in USDC. The exchange trades the stocks against USDT, USDC or BNB, the marketplace has a Stock filter, and the community has one room per stock.

## Stack

Next.js 16 (App Router), React 19, wagmi 2, viem 2, Privy, Tailwind CSS 4, Foundry, OpenZeppelin 5.4.
