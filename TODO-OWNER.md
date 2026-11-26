# Owner to-do (things only you can do)

Last updated 2026-11-26. Everything else is done and pushed.

## Must do before real users

3. ~~Etherscan API v2 key~~: **not needed any more.** The activity feed and chat history now read contract logs
   over public BSC RPCs (`eth_getLogs`) and cache them in Upstash/KV. An Etherscan key is only useful for step 6.

4. **One small real test** on https://beta.grailio.xyz: buy and open one **Fable Low** pack ($1 USDC + gas). Check the card holds one of NVDA, AAPL, TSLA, GOOGL or AMZN. Then try a $1 swap on /trade.

## When you're ready

5. **Medium and High packs**: send USDC (BNB Chain USDC `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`) to the pack contract
   `0xdB862A24350E9fE184c0d1658912d309749D8672`. Each unopened pack reserves its top prize; `/treasury` shows capacity. The owner wallet can withdraw anything not owed.

6. **Verify the contracts on BscScan** (needs an Etherscan API key that covers BNB Chain), from `contracts/`:
   `ETHERSCAN_API_KEY=… BSC_RPC_URL=https://bsc-dataseed.bnbchain.org ./script/verify.sh`

7. **Google sign-in branding**: add your own Google OAuth client in Privy so users see "Grailio", not Privy.

8. **Optional env on Vercel**: `NEXT_PUBLIC_BSC_RPC_URL` (your own RPC, avoids public rate limits), `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (mobile wallets via QR).

9. **Clean up**: stop the extra local dev server on port 3000 if it's still running.

## Already set up (no action)

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
