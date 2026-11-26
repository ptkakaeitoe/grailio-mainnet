// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {CollectPacks, IAggregatorV3} from "../src/CollectPacks.sol";
import {AtlasFeedAdapter, IAtlasMultiFeed} from "../src/AtlasFeedAdapter.sol";
import {AddStocks} from "../script/AddStocks.s.sol";

/// Atlas bStock prices through AtlasFeedAdapter, added to the deployed CollectPacks on a
/// BNB Chain mainnet fork (owner impersonated, nothing broadcast). Run with:
///   BSC_RPC_URL=https://bsc-dataseed.bnbchain.org forge test --match-contract Fork -vv
contract AtlasStocksForkTest is Test {
    CollectPacks constant PACKS = CollectPacks(0xbdeb4324F9Ec736D1146798872E52E67cDE23DE5);
    IAtlasMultiFeed constant ATLAS = IAtlasMultiFeed(0xEAcE519ebB14fB8404fA6DdD23C3b34abaDE44aa);
    IERC20 constant USDC = IERC20(0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d);
    uint256 constant LOW = 0; // Ember: every card $0.95

    AddStocks script;
    AddStocks.Stock[] stocks;
    address owner;
    address player = makeAddr("player");

    function setUp() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        owner = PACKS.owner();
        script = new AddStocks();
        AddStocks.Stock[] memory s = script.load(vm.readFile("script/stocks.mainnet.json"));
        for (uint256 i; i < s.length; ++i) stocks.push(s[i]);
        deal(address(USDC), player, 100e18);
        vm.prank(player);
        USDC.approve(address(PACKS), type(uint256).max);
    }

    function test_adapterReadsAtlas() public {
        for (uint256 i; i < stocks.length; ++i) {
            AtlasFeedAdapter feed = new AtlasFeedAdapter(ATLAS, stocks[i].atlasFeedId, stocks[i].symbol);
            (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();
            console.log(stocks[i].symbol, uint256(answer), vm.getBlockTimestamp() - updatedAt);
            assertEq(feed.decimals(), 18);
            assertGt(answer, 1e18, "price below $1"); // every bStock trades well above $1
            assertLt(answer, 100_000e18);
            assertGt(updatedAt, 0);
            assertLe(updatedAt, vm.getBlockTimestamp());
            assertLt(vm.getBlockTimestamp() - updatedAt, 1 hours, "Atlas feed not pushing");
            assertEq(answeredInRound, roundId);
        }
    }

    function test_unknownFeedRefusedAtDeploy() public {
        vm.expectRevert(AtlasFeedAdapter.NoPrice.selector);
        new AtlasFeedAdapter(ATLAS, 1, "none");
    }

    /// The config parses into the packed route CollectPacks expects.
    function test_configParses() public view {
        assertGe(stocks.length, 1);
        AddStocks.Stock memory s = stocks[0];
        assertEq(uint8(s.route), uint8(CollectPacks.Route.UniswapV3));
        assertEq(address(bytes20(s.v3Path)), address(USDC));
        assertEq((s.v3Path.length - 20) % 23, 0);
        assertEq(s.maxFeedAge, 6 hours);
    }

    /// Add each stock to the live CollectPacks, make it the only active asset, open a Low pack.
    /// With a working route the card fills within the Atlas guard; otherwise it holds USDC.
    function test_lowPackOpensStockCard() public {
        uint256 n = PACKS.assetCount();
        for (uint256 i; i < stocks.length; ++i) {
            AddStocks.Stock memory s = stocks[i];
            uint256 id = _addStock(s);
            assertEq(id, n + i);
            assertGt(PACKS.priceOf(id), 0, "stale Atlas price");
            _onlyActive(id);

            vm.prank(player);
            uint256 packId = PACKS.buy(LOW, 1);
            (, uint64 revealBlock,,,) = PACKS.packs(packId);
            vm.roll(revealBlock + 1);
            vm.prank(player);
            uint256 cardId = PACKS.open(packId);

            (uint8 asset,,, bool filled, uint128 usd, uint256 amount) = PACKS.cards(cardId);
            assertEq(asset, id);
            assertEq(usd, 0.95e18);
            uint256 fair = PACKS.fairAmount(id, usd);
            console.log(s.symbol);
            console.log("  filled:", filled);
            console.log("  amount:", amount);
            console.log("  fair  :", fair);
            uint256 before = IERC20(s.token).balanceOf(player);
            uint256 usdcBefore = USDC.balanceOf(player);
            vm.prank(player);
            PACKS.redeem(cardId);
            if (filled) {
                assertGe(amount, fair * (10_000 - s.maxSlippageBps) / 10_000);
                assertEq(IERC20(s.token).balanceOf(player) - before, amount);
            } else {
                // No fair swap: the card kept its $0.95 in USDC and redeems for it.
                assertEq(USDC.balanceOf(player) - usdcBefore, 0.95e18);
            }
        }
    }

    /// A feed older than maxFeedAge prices at 0, so the card falls back to USDC.
    function test_staleFeedFallsBackToUsdc() public {
        uint256 id = _addStock(stocks[0]);
        _onlyActive(id);
        vm.warp(vm.getBlockTimestamp() + stocks[0].maxFeedAge + 1);
        assertEq(PACKS.priceOf(id), 0);

        vm.prank(player);
        uint256 packId = PACKS.buy(LOW, 1);
        (, uint64 revealBlock,,,) = PACKS.packs(packId);
        vm.roll(revealBlock + 1);
        vm.prank(player);
        uint256 cardId = PACKS.open(packId);
        (,,, bool filled, uint128 usd,) = PACKS.cards(cardId);
        assertFalse(filled);
        assertEq(usd, 0.95e18);
    }

    function _addStock(AddStocks.Stock memory s) internal returns (uint256 id) {
        AtlasFeedAdapter feed = new AtlasFeedAdapter(ATLAS, s.atlasFeedId, s.symbol);
        vm.prank(owner);
        id = PACKS.addAsset(
            IERC20Metadata(s.token), IAggregatorV3(address(feed)), s.maxFeedAge, s.maxSlippageBps, s.route, s.v3Path, s.v2Path
        );
    }

    function _onlyActive(uint256 id) internal {
        vm.startPrank(owner);
        for (uint256 j; j < PACKS.assetCount(); ++j) {
            PACKS.setAssetActive(j, j == id);
        }
        vm.stopPrank();
    }
}
