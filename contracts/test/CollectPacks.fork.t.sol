// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CollectPacks} from "../src/CollectPacks.sol";
import {CollectStaking, ICollectCards} from "../src/CollectStaking.sol";
import {MainnetConfig as M} from "../script/MainnetConfig.sol";

/// Runs against a local fork of BNB Smart Chain mainnet: real USDC, Chainlink feeds and
/// DEX pools. Nothing is broadcast. USDC on BNB Chain has 18 decimals. Run with:
///   BSC_RPC_URL=https://bsc-dataseed.bnbchain.org forge test --match-contract Fork -vv
contract CollectPacksForkTest is Test {
    CollectPacks packs;
    address owner = makeAddr("owner");
    address player = makeAddr("player");
    address treasury = makeAddr("treasury");
    IERC20 usdc = IERC20(M.USDC);

    function setUp() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        packs = M.deploy(owner);
        vm.startPrank(owner);
        M.addTiers(packs);
        M.addAssets(packs);
        vm.stopPrank();

        deal(M.USDC, owner, 100e18);
        deal(M.USDC, player, 100e18);
        vm.prank(owner);
        usdc.transfer(address(packs), 50e18); // seed the pool
        vm.prank(player);
        usdc.approve(address(packs), type(uint256).max);
    }

    function test_feedsAreLiveForEveryAsset() public view {
        for (uint256 i; i < packs.assetCount(); ++i) {
            assertGt(packs.priceOf(i), 0, "stale or missing feed");
        }
    }

    /// Every asset's real route fills a $4 card within its Chainlink guard.
    function test_everyAssetFillsOnRealPools() public {
        string[5] memory names = ["BTCB", "ETH", "WBNB", "LINK", "CAKE"];
        for (uint256 a; a < packs.assetCount(); ++a) {
            // Leave only this asset active so the roll must pick it.
            vm.startPrank(owner);
            for (uint256 j; j < packs.assetCount(); ++j) {
                packs.setAssetActive(j, j == a);
            }
            vm.stopPrank();

            vm.prank(player);
            uint256 packId = packs.buy(1, 1); // Classic
            (, uint64 revealBlock,,,) = packs.packs(packId);
            vm.roll(revealBlock + 1);
            // Force Legendary ($4) with a hash whose roll lands in the top 5%.
            bytes32 h = _hashForRarity(packId, 3);
            vm.setBlockhash(revealBlock, h);
            vm.prank(player);
            uint256 cardId = packs.open(packId);

            (uint8 asset,, uint8 rarity, bool filled, uint128 usd, uint256 amount) = packs.cards(cardId);
            assertEq(asset, a);
            assertEq(rarity, 3);
            uint256 fair = packs.fairAmount(a, usd);
            console.log(names[a]);
            console.log("  filled:", filled);
            console.log("  amount:", amount);
            console.log("  fair  :", fair);
            assertTrue(filled, "swap refused on real pools");
            assertGe(amount, fair * (10_000 - packs.asset(a).maxSlippageBps) / 10_000);

            // Redeem pays the real token out.
            uint256 before = IERC20(address(packs.asset(a).token)).balanceOf(player);
            vm.prank(player);
            packs.redeem(cardId);
            assertEq(IERC20(address(packs.asset(a).token)).balanceOf(player) - before, amount);
        }
    }

    function test_treasuryRoundTripOnRealUsdc() public {
        vm.prank(player);
        uint256 packId = packs.buy(2, 1); // Futuristic reserves $10.13
        assertEq(packs.reserved(), 10.13e18);
        assertEq(packs.surplus(), 51e18 - 10.13e18);

        vm.prank(owner);
        packs.pause();
        vm.prank(player);
        packs.refund(packId);
        vm.prank(owner);
        uint256 out = packs.withdrawAll(treasury);
        assertEq(out, 50e18);
        assertEq(usdc.balanceOf(treasury), 50e18);
        assertEq(usdc.balanceOf(player), 100e18);
    }

    /// Finds a block hash that makes `packId` roll `rarity` on the Classic odds.
    function _hashForRarity(uint256 packId, uint8 rarity) internal view returns (bytes32 h) {
        uint256 lo = rarity == 3 ? 9_500 : 0;
        uint256 hi = rarity == 3 ? 10_000 : 5_000;
        for (uint256 i;; ++i) {
            h = keccak256(abi.encode("salt", i));
            uint256 seed = uint256(keccak256(abi.encode(h, packId, address(packs))));
            uint256 roll = (seed >> 128) % 10_000;
            if (roll >= lo && roll < hi) return h;
        }
    }

    /// The whole Realistic money path on real pools: $1 in, $0.95 swapped into a
    /// card, $0.05 revenue, half to staking, paid out with a 7-day half-life.
    function test_realisticRevenueReachesStakers() public {
        CollectStaking staking = new CollectStaking(ICollectCards(address(packs)), usdc);
        vm.prank(owner);
        packs.setShares(address(staking), 5000, address(0), 0);
        vm.prank(owner);
        packs.withdrawAll(treasury); // take the seed out: Realistic needs none

        uint256[] memory ids = new uint256[](10);
        for (uint256 i; i < 10; ++i) {
            vm.prank(player);
            uint256 packId = packs.buy(0, 1); // Realistic
            (, uint64 revealBlock,,,) = packs.packs(packId);
            vm.roll(revealBlock + 1);
            vm.prank(player);
            ids[i] = packs.open(packId);
            (,,, bool filled, uint128 usd,) = packs.cards(ids[i]);
            assertTrue(filled, "swap refused on real pools");
            assertEq(usd, 0.95e18);
        }
        assertEq(packs.pendingRevenue(), int256(0.5e18));

        assertEq(packs.distribute(), 0.5e18);
        assertEq(usdc.balanceOf(address(staking)), 0.25e18);
        assertEq(packs.ownerFree(), 0.25e18);

        vm.prank(player);
        packs.setApprovalForAll(address(staking), true);
        vm.prank(player);
        staking.stake(ids);
        vm.warp(vm.getBlockTimestamp() + 7 days);
        uint256 before = usdc.balanceOf(player);
        vm.prank(player);
        staking.claim(ids);
        assertApproxEqAbs(usdc.balanceOf(player) - before, 0.125e18, 1e9); // half of 0.25 in a week
        vm.prank(player);
        staking.unstake(ids);
        assertEq(packs.ownerOf(ids[0]), player);
        assertEq(usdc.balanceOf(address(packs)), packs.ownerFree()); // only the owner's part is left
    }
}
