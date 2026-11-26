// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {CollectPacks, IAggregatorV3, ICollectPoints, ISwapRouter02, IV2Router} from "../src/CollectPacks.sol";
import {CollectPoints} from "../src/CollectPoints.sol";
import {CollectDAO, IPoints} from "../src/CollectDAO.sol";
import {MockFeed, MockRouter, MockToken} from "./Mocks.sol";

contract CollectDAOTest is Test {
    CollectPacks packs;
    CollectPoints points;
    CollectDAO dao;
    MockToken usdc;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        vm.warp(1_800_000_000);
        vm.roll(100);
        usdc = new MockToken("USDC", 6);
        MockToken btc = new MockToken("BTC.b", 8);
        MockFeed feed = new MockFeed(60_000e8);
        MockRouter router = new MockRouter(usdc);
        router.setPrice(address(btc), 60_000e8, 8);

        packs = new CollectPacks(usdc, ISwapRouter02(address(router)), IV2Router(address(router)), owner);
        points = new CollectPoints(owner);
        dao = new CollectDAO(IPoints(address(points)), owner);
        vm.startPrank(owner);
        packs.addTier(1e6, [uint16(5000), 2500, 2000, 500], [uint128(0.82e6), 0.9e6, 1.04e6, 1.34e6]);
        address[] memory none;
        packs.addAsset(
            IERC20Metadata(address(btc)), IAggregatorV3(address(feed)), 1 days, 200, CollectPacks.Route.UniswapV3,
            abi.encodePacked(address(usdc), uint24(500), address(btc)), none
        );
        points.setAwarder(address(packs), true);
        packs.setPoints(ICollectPoints(address(points)), 1);
        vm.stopPrank();
        usdc.mint(address(packs), 100e6);
        for (uint256 i; i < 3; ++i) {
            address who = [alice, bob, carol][i];
            usdc.mint(who, 100e6);
            vm.prank(who);
            usdc.approve(address(packs), type(uint256).max);
        }
    }

    /// Buys `qty` packs in batches of up to 10 (the contract's per-purchase cap).
    function _packs(address who, uint256 qty) internal {
        while (qty > 0) {
            uint256 batch = qty > 10 ? 10 : qty;
            vm.prank(who);
            packs.buy(0, batch);
            qty -= batch;
        }
    }

    // ---- points ----

    function test_buyingPacksAwardsPoints() public {
        _packs(alice, 3);
        assertEq(points.pointsOf(alice), 3);
        assertEq(points.totalPoints(), 3);
        _packs(alice, 2);
        assertEq(points.pointsOf(alice), 5);
    }

    function test_pointsAreNotTransferableOrMintable() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CollectPoints.NotAwarder.selector, alice));
        points.award(alice, 100);
        // No transfer/approve exist at all: the selector isn't on the contract.
        (bool ok,) = address(points).call(abi.encodeWithSignature("transfer(address,uint256)", bob, 1));
        assertFalse(ok);
    }

    function test_pastPointsAreCheckpointed() public {
        _packs(alice, 2); // block 100
        vm.roll(110);
        _packs(alice, 3); // block 110
        vm.roll(120);
        assertEq(points.pastPointsOf(alice, 105), 2);
        assertEq(points.pastPointsOf(alice, 115), 5);
        assertEq(points.pastTotalPoints(105), 2);
        vm.expectRevert();
        points.pastPointsOf(alice, 120); // current block: not final yet
    }

    function test_packsCanDisconnectPoints() public {
        vm.prank(owner);
        packs.setPoints(ICollectPoints(address(0)), 0);
        _packs(alice, 2);
        assertEq(points.pointsOf(alice), 0);
    }

    // ---- DAO ----

    function _propose(address who) internal returns (uint256 id) {
        vm.prank(who);
        id = dao.propose("Add an ETH Legendary art drop", "Details here.");
    }

    function test_proposeNeedsThreshold() public {
        _packs(alice, 4);
        vm.roll(vm.getBlockNumber() + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CollectDAO.BelowThreshold.selector, 4, 5));
        dao.propose("t", "b");
        _packs(alice, 1);
        vm.roll(vm.getBlockNumber() + 1);
        _propose(alice);
        assertEq(dao.proposalCount(), 1);
    }

    function test_votesWeightedBySnapshotPoints() public {
        _packs(alice, 6);
        _packs(bob, 3);
        _packs(carol, 1);
        vm.roll(vm.getBlockNumber() + 1);
        uint256 id = _propose(alice);

        // Points bought after the proposal don't count.
        _packs(bob, 10);
        vm.roll(vm.getBlockNumber() + 1);

        vm.prank(alice);
        dao.vote(id, CollectDAO.Support.For);
        vm.prank(bob);
        dao.vote(id, CollectDAO.Support.Against);
        vm.prank(carol);
        dao.vote(id, CollectDAO.Support.Abstain);
        CollectDAO.Proposal memory p = dao.proposal(id);
        assertEq(p.forVotes, 6);
        assertEq(p.againstVotes, 3); // not 13
        assertEq(p.abstainVotes, 1);
        assertEq(dao.voteOf(id, bob), 1);
        assertEq(dao.votingPower(id, bob), 3);

        vm.prank(alice);
        vm.expectRevert(CollectDAO.AlreadyVoted.selector);
        dao.vote(id, CollectDAO.Support.For);
        assertEq(uint8(dao.state(id)), uint8(CollectDAO.State.Active));

        vm.warp(vm.getBlockTimestamp() + 3 days);
        assertEq(uint8(dao.state(id)), uint8(CollectDAO.State.Passed));
        vm.prank(carol);
        vm.expectRevert(CollectDAO.NotActive.selector);
        dao.vote(id, CollectDAO.Support.For);
    }

    function test_noPowerNoVote() public {
        _packs(alice, 5);
        vm.roll(vm.getBlockNumber() + 1);
        uint256 id = _propose(alice);
        _packs(bob, 5); // too late for this proposal
        vm.prank(bob);
        vm.expectRevert(CollectDAO.NoVotingPower.selector);
        dao.vote(id, CollectDAO.Support.For);
    }

    function test_quorumAndMajority() public {
        _packs(alice, 5);
        _packs(bob, 60);
        vm.roll(vm.getBlockNumber() + 1);
        uint256 id = _propose(alice);
        (uint256 total, uint256 needed) = dao.quorumOf(id);
        assertEq(total, 65);
        assertEq(needed, 7); // 10% of 65 = 6.5, rounded up
        vm.prank(alice);
        dao.vote(id, CollectDAO.Support.For); // 5 < 7
        vm.warp(vm.getBlockTimestamp() + 3 days);
        assertEq(uint8(dao.state(id)), uint8(CollectDAO.State.Defeated));

        uint256 id2 = _propose(alice);
        vm.prank(alice);
        dao.vote(id2, CollectDAO.Support.For);
        vm.prank(bob);
        dao.vote(id2, CollectDAO.Support.Against);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        assertEq(uint8(dao.state(id2)), uint8(CollectDAO.State.Defeated)); // against wins
    }

    function test_cancelByProposerOrGuardian() public {
        _packs(alice, 5);
        _packs(bob, 5);
        vm.roll(vm.getBlockNumber() + 1);
        uint256 id = _propose(alice);
        vm.prank(bob);
        vm.expectRevert(CollectDAO.NotAllowed.selector);
        dao.cancel(id);
        vm.prank(owner);
        dao.cancel(id);
        assertEq(uint8(dao.state(id)), uint8(CollectDAO.State.Cancelled));
        vm.prank(alice);
        vm.expectRevert(CollectDAO.NotActive.selector);
        dao.vote(id, CollectDAO.Support.For);
    }

    function test_textAndParams() public {
        _packs(alice, 5);
        vm.roll(vm.getBlockNumber() + 1);
        vm.startPrank(alice);
        vm.expectRevert(CollectDAO.BadText.selector);
        dao.propose("", "b");
        vm.expectRevert(CollectDAO.BadText.selector);
        dao.propose(string(new bytes(121)), "b");
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        dao.setParams(1 days, 500, 1);
        vm.startPrank(owner);
        vm.expectRevert(CollectDAO.BadParams.selector);
        dao.setParams(10 minutes, 500, 1);
        dao.setParams(1 days, 500, 1);
        vm.stopPrank();
        assertEq(dao.votingPeriod(), 1 days);
    }
}
