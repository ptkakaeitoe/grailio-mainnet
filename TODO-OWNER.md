# Owner to-do (things only you can do)

Last updated 2026-11-27. Everything else is done.

## Must do before real users

0. **Redeploy on USDT** (packs, market and staking now use USDT; the first deploy used USDC and is retired, it holds nothing). You need a little BNB for gas in `0x073d…547F`. From `contracts/`:
   ```bash
   forge clean && forge script script/DeployCollectPacks.s.sol --rpc-url bsc --account grailio-mainnet-deployer --slow
   ```
   That dry run sends nothing. If it ends with no errors, run it again with `--broadcast` added. Then tell Claude "deployed": it updates `deployments/56.json`, verifies the new contracts on Sourcify and pushes the app (the USDT app is committed locally and held back until then, so the live site keeps working on the old contracts meanwhile).

4. **One small real test** on https://beta.grailio.xyz: buy and open one **Fable Low** pack ($1 USDT + gas; also try paying with BNB). Check the card holds one of NVDA, AAPL, TSLA, GOOGL or AMZN. Then try a $1 swap on /trade.

## When you're ready

5. **Medium and High packs**: send USDT (BNB Chain USDT `0x55d398326f99059fF775485246999027B3197955`) to the **new** pack contract (address in `deployments/56.json` after step 0). Each unopened pack reserves its top prize; `/treasury` shows capacity. The owner wallet can withdraw anything not owed.

6. **(Optional) BscScan's own verified badge**: all 23 contracts are already verified as an exact match on Sourcify (sourcify.dev, chain 56). BscScan's own badge needs a *paid* Etherscan plan (the free plan doesn't cover BNB Chain); with one, run from `contracts/`: `ETHERSCAN_API_KEY=… BSC_RPC_URL=https://bsc-rpc.publicnode.com ./script/verify.sh`

7. **Google sign-in branding**: add your own Google OAuth client in Privy so users see "Grailio", not Privy.

8. **Optional env on Vercel**: `NEXT_PUBLIC_BSC_RPC_URL` (your own RPC, avoids public rate limits), `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (mobile wallets via QR).

9. **Clean up**: stop the extra local dev server on port 3000 if it's still running.

## Already set up (no action)

- Contracts verified on Sourcify (exact match, all 23).
- Activity feed and chat history read from public RPC logs, cached in Upstash (no Etherscan key needed).
- Privy dashboard configured (login methods, embedded wallets, allowed domains).
- Chat relayer wallet funded with BNB.
- `beta.grailio.xyz` is served by the `grailio-mainnet` Vercel project (duplicate deleted); chat relay configured.
- `/dao` is hidden on purpose (`DAO_VISIBLE` in the app); gifts live on the packs page.

- Contracts deployed on BNB Chain (see `deployments/56.json`): 15 stocks, 9 tiers, baskets Fable / Saga / Mythos, 16 chat rooms. Owner `0x073d…547F`.
- Vercel env set: `NEXT_PUBLIC_PRIVY_APP_ID`, `RELAYER_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (copied from the old bsctemp KV, ping OK), `BETA_COOKIE_SECRET`, `NEXT_PUBLIC_SITE_URL` (https://beta.grailio.xyz), `NEXT_PUBLIC_TESTNET_URL`.
- Testnet app (`grailio` on Vercel): `NEXT_PUBLIC_MAINNET_URL=https://beta.grailio.xyz`, so its Testnet / Mainnet switch links to the mainnet.
- Beta gate is off: anyone can connect.
- Swap fees go to `0x9c01…a524`.

## Never

- Never paste private keys, the Privy app secret or API tokens into chat or commits.
- If a deploy script stops halfway, don't rerun it blindly: check what landed first (use `--slow`).
