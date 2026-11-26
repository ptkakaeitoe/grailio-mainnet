// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {CollectPacks, ICollectPoints, ISwapRouter02, IV2Router} from "../src/CollectPacks.sol";
import {CollectPoints} from "../src/CollectPoints.sol";
import {CollectDAO, IPoints} from "../src/CollectDAO.sol";
import {CollectMarket} from "../src/CollectMarket.sol";
import {CollectChat} from "../src/CollectChat.sol";
import {CollectNames} from "../src/CollectNames.sol";
import {CollectProfiles, IStakes} from "../src/CollectProfiles.sol";
import {CollectStaking, ICollectCards} from "../src/CollectStaking.sol";
import {AtlasFeedAdapter} from "../src/AtlasFeedAdapter.sol";
import {StockConfig} from "./StockConfig.sol";

/// BNB Smart Chain (chain 56) addresses, read on-chain on 2026-11-26, and the whole Grailio
/// deploy. Cards hold tokenized stocks only (bStocks, priced by Atlas; see StockConfig and
/// script/stocks.mainnet.json); asset ID = index in the config's `stocks`.
///
/// USDT on BNB Chain has 18 decimals. CollectPacks reads USDT's decimals at deploy, so all
/// USDT amounts below are written with 18 decimals.
library MainnetConfig {
    address internal constant USDT = 0x55d398326f99059fF775485246999027B3197955; // Binance-Peg USDT, 18 dec

    // Routers. PancakeSwap's SmartRouter takes Uniswap SwapRouter02-style exactInput
    // (no deadline field), which matches ISwapRouter02 in CollectPacks.
    address internal constant PANCAKE_SMART_ROUTER = 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4; // factory 0x0BFbCF9f…1865 (v3)
    address internal constant PANCAKE_V2_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E; // factory 0xcA143Ce3…0c73

    /// Pack editions in tier order; each has Low, Medium, High tiers (3 per edition) and
    /// draws from `baskets.<edition>` in the stocks config.
    uint256 internal constant EDITIONS = 3;

    function edition(uint256 i) internal pure returns (string memory) {
        return ["fable", "saga", "mythos"][i];
    }

    /// Tier order matches the app's packs: 0 Fable Low, 1 Fable Medium, 2 Fable High,
    /// 3 Saga Low ... 8 Mythos High. Saga is Fable x3 ($3), Mythos is Fable x5 ($5).
    /// Low: every card holds 95% of the price (rarity sets the staking multiplier only).
    function addTiers(CollectPacks packs) internal {
        uint16[4] memory oddsMed = [uint16(5000), 2500, 2000, 500];
        uint16[4] memory oddsHigh = [uint16(6000), 2500, 1200, 300];
        uint8[3] memory mult = [1, 3, 5];
        for (uint256 e; e < EDITIONS; ++e) {
            uint128 m = mult[e];
            packs.addTier(m * 1e18, oddsMed, [m * 0.95e18, m * 0.95e18, m * 0.95e18, m * 0.95e18]);
            packs.addTier(m * 1e18, oddsMed, [m * 0.46e18, m * 0.8e18, m * 1.4e18, m * 4e18]);
            packs.addTier(m * 1e18, oddsHigh, [m * 0.2e18, m * 0.6e18, m * 2.8e18, m * 10.13e18]);
        }
    }

    function deployPacks(address owner) internal returns (CollectPacks) {
        // Tier amounts above are written for 18-decimal USDT; stop if that ever stops being true.
        require(IERC20Metadata(USDT).decimals() == 18, "MainnetConfig tier amounts assume 18-decimal USDT");
        return new CollectPacks(IERC20(USDT), ISwapRouter02(PANCAKE_SMART_ROUTER), IV2Router(PANCAKE_V2_ROUTER), owner);
    }

    struct Params {
        address deployer; // msg.sender of every call (broadcaster or prank)
        address newOwner; // 0 = deployer stays owner
        uint16 stakingBps;
        address daoWallet;
        uint16 daoBps;
    }

    struct Deployment {
        CollectPacks packs;
        CollectMarket market;
        CollectPoints points;
        CollectDAO dao;
        CollectStaking staking;
        CollectChat chat;
        CollectNames names;
        CollectProfiles profiles;
        AtlasFeedAdapter[] adapters; // per stock, index = asset ID
        uint8[][] baskets; // per edition
    }

    /// Everything, in order: packs (9 tiers, Low tiers on sale), one Atlas-priced asset per
    /// stock, an asset basket per edition, market, points, DAO, staking, chat (lounge + one
    /// room per stock), names, profiles; then ownership offered to `newOwner` if set.
    /// Every call must come from `p.deployer` (vm.startBroadcast or vm.startPrank).
    function deployAll(Params memory p, string memory json) internal returns (Deployment memory d) {
        StockConfig.Stock[] memory stocks = StockConfig.load(json);
        StockConfig.requireNoTodo(stocks);

        d.packs = deployPacks(p.deployer);
        addTiers(d.packs);
        // Launch with the Low tiers on sale; Medium and High need a seeded pool and are
        // switched on later with setTierActive.
        for (uint256 e; e < EDITIONS; ++e) {
            d.packs.setTierActive(e * 3 + 1, false);
            d.packs.setTierActive(e * 3 + 2, false);
        }
        d.adapters = new AtlasFeedAdapter[](stocks.length);
        for (uint256 i; i < stocks.length; ++i) {
            uint256 id;
            (d.adapters[i], id) = StockConfig.add(d.packs, stocks[i]);
            require(id == i, "asset ID must equal the stock's index");
        }
        d.baskets = new uint8[][](EDITIONS);
        for (uint256 e; e < EDITIONS; ++e) {
            d.baskets[e] = StockConfig.basket(json, edition(e), stocks);
            for (uint256 t; t < 3; ++t) {
                d.packs.setTierAssets(e * 3 + t, d.baskets[e]);
            }
        }

        // Card market: BNB or USDT listings; USDT fees are pack-pool revenue.
        d.market = new CollectMarket(IERC20(USDT), address(d.packs), p.deployer);
        d.market.setListable(address(d.packs), true);
        d.market.setTreasury(address(d.packs), true);
        // DAO points: 1 per pack bought (any price), non-transferable. The DAO votes with them.
        d.points = new CollectPoints(p.deployer);
        d.points.setAwarder(address(d.packs), true);
        d.packs.setPoints(ICollectPoints(address(d.points)), 1);
        d.dao = new CollectDAO(IPoints(address(d.points)), p.deployer);
        // Staking: cards earn the staking share of revenue, paid out with a 7-day half-life.
        d.staking = new CollectStaking(ICollectCards(address(d.packs)), IERC20(USDT));
        d.packs.setShares(address(d.staking), p.stakingBps, p.daoWallet, p.daoBps);

        // Chat: an open lounge, then one encrypted room per stock (asset order), named by
        // plain ticker and gated by holding or staking a card of that stock.
        d.chat = new CollectChat(p.deployer);
        d.chat.addRoom("The lounge", CollectChat.Gate.Open, address(0), 0, 0, false);
        for (uint256 i; i < stocks.length; ++i) {
            d.chat.addRoom(stocks[i].ticker, CollectChat.Gate.Card, address(d.staking), i, 1, true);
        }
        d.names = new CollectNames();
        d.profiles = new CollectProfiles(IERC721(address(d.packs)), IStakes(address(d.staking)));

        if (p.newOwner != address(0) && p.newOwner != p.deployer) {
            d.packs.transferOwnership(p.newOwner);
            d.market.transferOwnership(p.newOwner);
            d.points.transferOwnership(p.newOwner);
            d.dao.transferOwnership(p.newOwner);
            d.chat.transferOwnership(p.newOwner); // the moderator stays the deployer until changed
        }
    }
}
