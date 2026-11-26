// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CollectPacks} from "../src/CollectPacks.sol";
import {CollectChat} from "../src/CollectChat.sol";
import {MainnetConfig as M} from "../script/MainnetConfig.sol";
import {StockConfig} from "../script/StockConfig.sol";

/// The full deploy (MainnetConfig.deployAll, as DeployCollectPacks runs it) on a local fork of
/// BNB Smart Chain mainnet, sent by a funded EOA through vm.startPrank: real USDC, Atlas
/// prices and PancakeSwap pools. Nothing is broadcast. Run with:
///   BSC_RPC_URL=https://bsc-rpc.publicnode.com forge test --match-contract Fork -vv
contract CollectPacksForkTest is Test {
    address constant DEPLOYER = 0x073d76f407F9242E014a1A6f8B2f67286E5A547F;
    IERC20 usdc = IERC20(M.USDC);
    M.Deployment d;
    CollectPacks packs;
    StockConfig.Stock[] stocks;
    address player = makeAddr("player");
    address treasury = makeAddr("treasury");

    function setUp() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        vm.deal(DEPLOYER, 1 ether);
        string memory json = vm.readFile(StockConfig.DEFAULT_PATH);
        StockConfig.Stock[] memory s = StockConfig.load(json);
        for (uint256 i; i < s.length; ++i) stocks.push(s[i]);

        vm.startPrank(DEPLOYER, DEPLOYER);
        d = M.deployAll(
            M.Params({deployer: DEPLOYER, newOwner: address(0), stakingBps: 5000, daoWallet: address(0), daoBps: 0}),
            json
        );
        vm.stopPrank();
        packs = d.packs;

        deal(M.USDC, player, 100e18);
        vm.prank(player);
        usdc.approve(address(packs), type(uint256).max);
    }

    function test_deployMatchesConfig() public view {
        assertEq(packs.owner(), DEPLOYER);
        assertEq(packs.assetCount(), 15);
        assertEq(packs.tierCount(), 9);
        uint128[3] memory price = [uint128(1e18), 3e18, 5e18];
        for (uint256 e; e < 3; ++e) {
            assertEq(packs.tier(e * 3).price, price[e]);
            assertEq(packs.tier(e * 3).backing[0], price[e] * 95 / 100); // Low: 95% every card
            assertEq(packs.maxPayout(e * 3 + 1), price[e] * 4); // Medium top $4 per $1
            assertEq(packs.maxPayout(e * 3 + 2), price[e] * 1013 / 100); // High top $10.13 per $1
            assertTrue(packs.tier(e * 3).active);
            assertFalse(packs.tier(e * 3 + 1).active);
            assertFalse(packs.tier(e * 3 + 2).active);
            for (uint256 t; t < 3; ++t) {
                assertEq(packs.tierAssetMask(e * 3 + t), uint256(0x1f) << (5 * e)); // 5 stocks each, in order
            }
        }
        for (uint256 i; i < 15; ++i) {
            assertEq(address(packs.asset(i).token), stocks[i].token);
            assertGt(packs.priceOf(i), 0, "stale Atlas price");
        }
        CollectChat.Room[] memory rooms = d.chat.rooms();
        assertEq(rooms.length, 16);
        assertEq(rooms[0].name, "The lounge");
        assertEq(rooms[1].name, "NVDA");
        assertEq(rooms[15].name, "EWT");
        assertEq(rooms[15].gateId, 14);
        assertEq(rooms[15].gate, address(d.staking));
        assertEq(packs.stakingSink(), address(d.staking));
    }

    /// Fable Low and Saga Low cards hold a stock from that edition's basket.
    function test_lowPacksDrawFromTheirEditionBasket() public {
        _openAndCheck(0, d.baskets[0], 0.95e18, 6);
        _openAndCheck(3, d.baskets[1], 2.85e18, 6);
        _openAndCheck(6, d.baskets[2], 4.75e18, 2);
    }

    function _openAndCheck(uint256 tierId, uint8[] memory basket, uint128 backing, uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            vm.prank(player);
            uint256 packId = packs.buy(tierId, 1);
            (, uint64 revealBlock,,,) = packs.packs(packId);
            vm.roll(revealBlock + 1);
            vm.setBlockhash(revealBlock, keccak256(abi.encode("fork", tierId, i)));
            vm.prank(player);
            uint256 cardId = packs.open(packId);
            (uint8 a,,, bool filled, uint128 usd, uint256 amount) = packs.cards(cardId);
            assertEq(usd, backing);
            bool inBasket;
            for (uint256 k; k < basket.length; ++k) {
                if (basket[k] == a) inBasket = true;
            }
            assertTrue(inBasket, "card asset outside the edition basket");
            console.log(stocks[a].ticker, filled, amount);
            if (filled) {
                assertGe(amount, packs.fairAmount(a, usd) * (10_000 - packs.asset(a).maxSlippageBps) / 10_000);
            }
        }
    }

    function test_treasuryRoundTripOnRealUsdc() public {
        vm.prank(DEPLOYER);
        packs.setTierActive(2, true);
        deal(M.USDC, address(packs), 50e18); // seed the pool
        vm.prank(player);
        uint256 packId = packs.buy(2, 1); // Fable High reserves $10.13
        assertEq(packs.reserved(), 10.13e18);

        vm.prank(DEPLOYER);
        packs.pause();
        vm.prank(player);
        packs.refund(packId);
        vm.prank(DEPLOYER);
        uint256 out = packs.withdrawAll(treasury);
        assertEq(out, 50e18);
        assertEq(usdc.balanceOf(player), 100e18);
    }
}
