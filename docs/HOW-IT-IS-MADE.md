# How Grailio is made

Grailio is a website that runs on BNB Smart Chain. Here's what we use and what each piece does.

## The blockchain

- **BNB Smart Chain (chain 56)** is where everything lives: packs, cards, the assets inside them, the marketplace, staking, chat and profiles. We wrote 9 smart contracts that run the whole app, and they are live on mainnet.
- **USDC** is what people pay with when they buy packs, and what staking rewards are paid in.
- **BscScan** lets anyone look up any transaction or card to check it's real.

## Signing in

- **Privy** handles sign-in and wallets. People can connect the wallet they already have, or just sign in with email or Google, and Privy creates a wallet for them. Nobody needs to install anything to get started.
- **Google** sign-in runs through Privy.
- **WalletConnect (Reown)** lets people connect a wallet app on their phone by scanning a QR code.

## Filling cards with stocks

- **bStocks** issues the tokenized stocks that go inside the cards: 15 of them, five per pack edition.
- **PancakeSwap v3** is the exchange our contract uses to buy the stock that goes inside each card when a pack is opened. Each purchase goes from USDC to USDT and then to the stock.
- **Atlas Oracle** gives us trusted stock prices on-chain, so every one of those purchases gets a fair price. If the price is more than 6 hours old or the purchase would come up short, the card holds USDC instead and gets filled later.

## Swapping tokens

- **KyberSwap** powers the built-in exchange. It searches across BNB Smart Chain's exchanges to find the best price for every swap of a stock against USDT, USDC or BNB.

## Prices and charts

- **Atlas Oracle** gives us live stock prices, read on-chain.
- **Yahoo Finance** gives us the 24-hour change and price charts for the stocks.
- **The PancakeSwap v3 WBNB/USDC pool** gives us the BNB price.

## Activity

- **The Etherscan API (v2)** gives us the history of what's happened on-chain, such as packs opened and cards traded, which we show in the activity feed.

## Free chat

- **Our own relay** pays the network fee for every chat message, so chatting is free. People sign their messages, so nobody (not even us) can fake or change them.
- **Upstash** keeps the relay from being spammed.
- The same relay gives people who claim a gift with a brand-new wallet a tiny bit of BNB for fees, so they can claim right away.

## The website

- **Next.js and React** are what the website is built with.
- **Demo mode** runs a full pretend version in the browser, so anyone can try everything without a wallet or money.

## Keeping it safe

- The stocks inside cards are locked by the contract. We can't take them out.
- If sales are ever paused, people can get a refund for packs they haven't opened.
- Pack results are decided by the blockchain after you buy, so nobody can know the result in advance. We plan to move to **Chainlink VRF** for even stronger randomness.
