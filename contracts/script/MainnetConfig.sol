// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {CollectPacks, IAggregatorV3, ISwapRouter02, IV2Router} from "../src/CollectPacks.sol";

/// BNB Smart Chain (chain 56) addresses, all read on-chain on 2026-11-26
/// (token symbols and decimals, Chainlink feed descriptions, router factories,
/// pool existence and depth on the PancakeSwap v3 factory).
///
/// Every token here, USDC included, has 18 decimals on BNB Chain. CollectPacks reads
/// USDC's decimals at deploy, so all USDC amounts below are written with 18 decimals.
library MainnetConfig {
    // Tokens
    address internal constant USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d; // Binance-Peg USDC, 18 dec
    address internal constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address internal constant BTCB = 0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c;
    address internal constant ETH = 0x2170Ed0880ac9A755fd29B2688956BD959F933F8;
    address internal constant LINK = 0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD;
    address internal constant CAKE = 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82;

    // Chainlink USD feeds (8 dec)
    address internal constant FEED_BTC = 0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf;
    address internal constant FEED_ETH = 0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e;
    address internal constant FEED_BNB = 0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE;
    address internal constant FEED_LINK = 0xca236E327F629f9Fc2c30A4E95775EbF0B89fac8;
    address internal constant FEED_CAKE = 0xB6064eD41d4f67e353768aA239cA86f4F73665a1;

    // Routers. PancakeSwap's SmartRouter takes Uniswap SwapRouter02-style exactInput
    // (no deadline field), which matches ISwapRouter02 in CollectPacks.
    address internal constant PANCAKE_SMART_ROUTER = 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4; // factory 0x0BFbCF9f…1865 (v3)
    address internal constant PANCAKE_V2_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E; // factory 0xcA143Ce3…0c73

    /// Tier order matches PACK_TIERS in the app: 0 Ember, 1 Flare, 2 Nova.
    function addTiers(CollectPacks packs) internal {
        // Ember: every card holds $0.95 of a random token (5% edge). Rarity no longer changes the value; it sets the staking multiplier.
        packs.addTier(1e18, [uint16(5000), 2500, 2000, 500], [uint128(0.95e18), 0.95e18, 0.95e18, 0.95e18]);
        packs.addTier(1e18, [uint16(5000), 2500, 2000, 500], [uint128(0.46e18), 0.8e18, 1.4e18, 4e18]);
        packs.addTier(1e18, [uint16(6000), 2500, 1200, 300], [uint128(0.2e18), 0.6e18, 2.8e18, 10.13e18]);
    }

    /// Asset order matches the app's cards: BTC, ETH, WBNB, LINK, CAKE.
    /// Routes go USDC -> WBNB (PancakeSwap v3 0.01%, the deepest USDC pool) -> token
    /// through each token's deepest WBNB pool. Slippage is vs Chainlink.
    function addAssets(CollectPacks packs) internal {
        address[] memory none;
        packs.addAsset(
            IERC20Metadata(BTCB),
            IAggregatorV3(FEED_BTC),
            1 days,
            150,
            CollectPacks.Route.UniswapV3,
            abi.encodePacked(USDC, uint24(100), WBNB, uint24(500), BTCB),
            none
        );
        packs.addAsset(
            IERC20Metadata(ETH),
            IAggregatorV3(FEED_ETH),
            1 days,
            200,
            CollectPacks.Route.UniswapV3,
            abi.encodePacked(USDC, uint24(100), WBNB, uint24(500), ETH),
            none
        );
        packs.addAsset(
            IERC20Metadata(WBNB),
            IAggregatorV3(FEED_BNB),
            1 days,
            150,
            CollectPacks.Route.UniswapV3,
            abi.encodePacked(USDC, uint24(100), WBNB),
            none
        );
        packs.addAsset(
            IERC20Metadata(LINK),
            IAggregatorV3(FEED_LINK),
            1 days,
            400,
            CollectPacks.Route.UniswapV3,
            abi.encodePacked(USDC, uint24(100), WBNB, uint24(2500), LINK),
            none
        );
        packs.addAsset(
            IERC20Metadata(CAKE),
            IAggregatorV3(FEED_CAKE),
            1 days,
            400,
            CollectPacks.Route.UniswapV3,
            abi.encodePacked(USDC, uint24(100), WBNB, uint24(2500), CAKE),
            none
        );
    }

    function deploy(address owner) internal returns (CollectPacks) {
        // Tier amounts above are written for 18-decimal USDC; stop if that ever stops being true.
        require(IERC20Metadata(USDC).decimals() == 18, "MainnetConfig tier amounts assume 18-decimal USDC");
        return new CollectPacks(IERC20(USDC), ISwapRouter02(PANCAKE_SMART_ROUTER), IV2Router(PANCAKE_V2_ROUTER), owner);
    }
}
