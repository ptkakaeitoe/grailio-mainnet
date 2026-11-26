// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CollectStaking, ICollectCards} from "../src/CollectStaking.sol";
import {MockToken} from "./Mocks.sol";

/// Stand-in for CollectPacks' card side: cards with an asset and a rarity, and heldOf.
contract MockCards is ERC721 {
    struct Card {
        uint8 asset;
        uint8 rarity;
    }

    mapping(uint256 => Card) private _cards;
    mapping(address => mapping(uint256 => uint256)) public heldOf;
    uint256 public next = 1;

    constructor() ERC721("Cards", "C") {}

    function mint(address to, uint8 asset, uint8 rarity) external returns (uint256 id) {
        id = next++;
        _cards[id] = Card(asset, rarity);
        _mint(to, id);
    }

    function cards(uint256 id) external view returns (uint8, uint8, uint8, bool, uint128, uint256) {
        Card memory c = _cards[id];
        return (c.asset, 0, c.rarity, true, 0.95e18, 1); // 18-decimal USDC value, past uint64
    }

    function _update(address to, uint256 id, address auth) internal override returns (address from) {
        from = super._update(to, id, auth);
        uint256 asset = _cards[id].asset;
        if (from != address(0)) --heldOf[from][asset];
        if (to != address(0)) ++heldOf[to][asset];
    }
}

contract CollectStakingTest is Test {
    CollectStaking staking;
    MockCards cards;
    MockToken usdc;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address pool = makeAddr("pool"); // stands in for CollectPacks.distribute

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockToken("USDC", 6);
        cards = new MockCards();
        staking = new CollectStaking(ICollectCards(address(cards)), IERC20(address(usdc)));
        vm.prank(alice);
        cards.setApprovalForAll(address(staking), true);
        vm.prank(bob);
        cards.setApprovalForAll(address(staking), true);
    }

    function _one(uint256 id) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = id;
    }

    function _stake(address who, uint8 asset, uint8 rarity) internal returns (uint256 id) {
        id = cards.mint(who, asset, rarity);
        vm.prank(who);
        staking.stake(_one(id));
    }

    function _fund(uint256 amount) internal {
        usdc.mint(address(staking), amount);
        staking.sync();
    }

    function _days(uint256 d) internal {
        vm.warp(vm.getBlockTimestamp() + d * 1 days);
    }

    // ------------------------------------------------------------ decay math

    function test_keptAfterMatchesHalfLife() public view {
        assertEq(staking.keptAfter(0), 1e18);
        assertEq(staking.keptAfter(7 days), 0.5e18);
        assertEq(staking.keptAfter(14 days), 0.25e18);
        assertApproxEqAbs(staking.keptAfter(1 days), 905_723_664_263_906_700, 1e6); // 2^(-1/7)
        assertApproxEqAbs(staking.keptAfter(3.5 days), 707_106_781_186_547_500, 1e6); // 2^(-1/2)
        assertApproxEqAbs(staking.keptAfter(30 days), 51_270_959_750_477_370, 1e6); // 2^(-30/7)
        assertEq(staking.keptAfter(7 days * 200), 0);
    }

    function testFuzz_keptAfterOnlyFalls(uint32 a, uint32 b) public view {
        (uint256 lo, uint256 hi) = a < b ? (a, b) : (b, a);
        assertGe(staking.keptAfter(lo), staking.keptAfter(hi));
    }

    // ------------------------------------------------------------ payouts

    function test_halfOfTheRevenueIsPaidInSevenDays() public {
        uint256 id = _stake(alice, 0, 0);
        _fund(100e6);
        _days(7);
        assertApproxEqAbs(staking.pending(id), 50e6, 2);
        _days(23); // day 30
        assertApproxEqAbs(staking.pending(id), 94.872904e6, 2);
        assertApproxEqAbs(staking.poolNow(), 5.127096e6, 2);
    }

    function test_rarityWeightsSplitThePayout() public {
        uint256 common = _stake(alice, 0, 0);
        uint256 legendary = _stake(bob, 1, 3);
        _fund(110e6);
        _days(7);
        assertApproxEqAbs(staking.pending(common), 5e6, 2); // 1/11 of 55
        assertApproxEqAbs(staking.pending(legendary), 50e6, 2); // 10/11 of 55
        assertEq(staking.weightOf(1), 2);
        assertEq(staking.weightOf(2), 4);
    }

    function test_updatingOftenPaysTheSameAsOnce() public {
        uint256 a = _stake(alice, 0, 0);
        _fund(100e6);
        for (uint256 i; i < 7 * 24; ++i) {
            vm.warp(vm.getBlockTimestamp() + 1 hours);
            staking.sync();
        }
        assertApproxEqAbs(staking.pending(a), 50e6, 200); // within 0.0002 USDC of the one-step result
    }

    function test_poolWaitsWhileNobodyStakes() public {
        _fund(100e6);
        _days(30);
        staking.sync();
        assertEq(staking.pool(), 100e6);
        uint256 id = _stake(alice, 0, 0);
        _days(7);
        assertApproxEqAbs(staking.pending(id), 50e6, 2);
    }

    function test_revenueIsNotPaidRetroactively() public {
        uint256 id = _stake(alice, 0, 0);
        _days(3);
        usdc.mint(address(staking), 100e6); // arrives, not yet synced
        assertEq(staking.pending(id), 0);
        staking.sync();
        assertEq(staking.pending(id), 0);
        _days(7);
        assertApproxEqAbs(staking.pending(id), 50e6, 2);
    }

    function test_lateStakerOnlySharesFromWhenTheyJoin() public {
        uint256 early = _stake(alice, 0, 0);
        _fund(100e6);
        _days(7); // alice alone: 50
        uint256 late = _stake(bob, 0, 0);
        _days(7); // the other 25 split evenly
        assertApproxEqAbs(staking.pending(early), 62.5e6, 3);
        assertApproxEqAbs(staking.pending(late), 12.5e6, 3);
    }

    function test_payoutPerDay() public {
        _stake(alice, 0, 0);
        _fund(100e6);
        assertApproxEqAbs(staking.payoutPerDay(), 9.427634e6, 2); // 100 * (1 - 2^(-1/7))
    }

    // ------------------------------------------------------------ stake, claim, unstake

    function test_claimPaysAndKeepsTheCardStaked() public {
        uint256 id = _stake(alice, 0, 0);
        _fund(100e6);
        _days(7);
        vm.prank(alice);
        staking.claim(_one(id));
        assertApproxEqAbs(usdc.balanceOf(alice), 50e6, 2);
        assertEq(staking.pending(id), 0);
        assertEq(cards.ownerOf(id), address(staking));
    }

    function test_unstakeReturnsCardAndRewards() public {
        uint256 id = _stake(alice, 2, 1);
        (address owner, uint64 since) = staking.stakes(id);
        assertEq(owner, alice);
        assertEq(since, vm.getBlockTimestamp());
        assertEq(staking.stakedBy(alice).length, 1);
        assertEq(staking.totalWeight(), 2);
        _fund(10e6);
        _days(14);
        vm.prank(alice);
        staking.unstake(_one(id));
        assertEq(cards.ownerOf(id), alice);
        assertApproxEqAbs(usdc.balanceOf(alice), 7.5e6, 2);
        assertEq(staking.totalWeight(), 0);
        assertEq(staking.stakedBy(alice).length, 0);
        (owner,) = staking.stakes(id);
        assertEq(owner, address(0));
    }

    function test_heldOfCountsWalletAndStakedCards() public {
        cards.mint(alice, 3, 0); // in the wallet
        _stake(alice, 3, 0); // staked
        assertEq(cards.heldOf(alice, 3), 1);
        assertEq(staking.heldOf(alice, 3), 2);
        assertEq(staking.heldOf(alice, 4), 0);
    }

    function test_onlyTheOwnerActsOnACard() public {
        uint256 id = cards.mint(alice, 0, 0);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CollectStaking.NotYourCard.selector, id));
        staking.stake(_one(id));

        vm.prank(alice);
        staking.stake(_one(id));
        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(CollectStaking.NotYourCard.selector, id));
        staking.claim(_one(id));
        vm.expectRevert(abi.encodeWithSelector(CollectStaking.NotYourCard.selector, id));
        staking.unstake(_one(id));
        vm.expectRevert(CollectStaking.NoCards.selector);
        staking.stake(new uint256[](0));
        vm.stopPrank();
    }

    /// However stakes, claims and deposits interleave, nobody is paid more than came in.
    function testFuzz_neverPaysOutMoreThanFunded(uint256 seed) public {
        uint256[] memory ids = new uint256[](4);
        address[2] memory who = [alice, bob];
        uint256 funded;
        for (uint256 i; i < 4; ++i) {
            ids[i] = _stake(who[i % 2], uint8(i), uint8(uint256(keccak256(abi.encode(seed, i))) % 4));
        }
        for (uint256 step; step < 12; ++step) {
            uint256 r = uint256(keccak256(abi.encode(seed, "step", step)));
            vm.warp(vm.getBlockTimestamp() + r % 5 days);
            uint256 amount = (r >> 64) % 1_000e6;
            usdc.mint(address(staking), amount);
            funded += amount;
            uint256 i = (r >> 128) % 4;
            vm.prank(who[i % 2]);
            staking.claim(_one(ids[i]));
        }
        _days(400);
        for (uint256 i; i < 4; ++i) {
            vm.prank(who[i % 2]);
            staking.unstake(_one(ids[i]));
        }
        uint256 paid = usdc.balanceOf(alice) + usdc.balanceOf(bob);
        assertLe(paid, funded);
        assertApproxEqAbs(paid, funded, 100); // everything reaches stakers, bar rounding dust
        assertEq(usdc.balanceOf(address(staking)), funded - paid);
    }
}
