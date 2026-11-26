// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {CollectPacks, IAggregatorV3, ISwapRouter02, IV2Router} from "../src/CollectPacks.sol";
import {MockFeed, MockRouter, MockToken} from "./Mocks.sol";

contract CollectPacksTest is Test {
    CollectPacks packs;
    MockToken usdc;
    MockToken btc;
    MockToken joe;
    MockFeed btcFeed;
    MockFeed joeFeed;
    MockRouter router;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address treasury = makeAddr("treasury");

    uint16[4] oddsClassic = [uint16(5000), 2500, 2000, 500];
    uint128[4] backingRealistic;
    uint128[4] backingClassic;
    uint16[4] oddsFuturistic = [uint16(6000), 2500, 1200, 300];
    uint128[4] backingFuturistic;
    /// 10 ** (usdcDecimals - 6): literals below are written in 6-decimal USDC and scaled by u().
    uint256 scale;

    /// USDC decimals for this run. CollectPacks18Test reruns every test with 18 (BNB Chain).
    function _usdcDecimals() internal pure virtual returns (uint8) {
        return 6;
    }

    /// A 6-decimal USDC literal in this run's USDC units.
    function u(uint256 amount6) internal view returns (uint256) {
        return amount6 * scale;
    }

    function u128(uint256 amount6) internal view returns (uint128) {
        return uint128(amount6 * scale);
    }

    function setUp() public {
        vm.warp(1_800_000_000);
        scale = 10 ** (_usdcDecimals() - 6);
        backingRealistic = [u128(0.82e6), u128(0.9e6), u128(1.04e6), u128(1.34e6)];
        backingClassic = [u128(0.46e6), u128(0.8e6), u128(1.4e6), u128(4e6)];
        backingFuturistic = [u128(0.2e6), u128(0.6e6), u128(2.8e6), u128(10.13e6)];
        usdc = new MockToken("USDC", _usdcDecimals());
        btc = new MockToken("BTC.b", 8);
        joe = new MockToken("JOE", 18);
        btcFeed = new MockFeed(60_000e8);
        joeFeed = new MockFeed(0.02e8);
        router = new MockRouter(usdc);
        router.setPrice(address(btc), 60_000e8, 8);
        router.setPrice(address(joe), 0.02e8, 18);

        packs = new CollectPacks(usdc, ISwapRouter02(address(router)), IV2Router(address(router)), owner);
        vm.startPrank(owner);
        packs.addTier(u128(1e6), oddsClassic, backingRealistic);
        packs.addTier(u128(1e6), oddsClassic, backingClassic);
        packs.addTier(u128(1e6), oddsFuturistic, backingFuturistic);
        address[] memory none;
        packs.addAsset(
            IERC20Metadata(address(btc)),
            IAggregatorV3(address(btcFeed)),
            1 days,
            200,
            CollectPacks.Route.UniswapV3,
            abi.encodePacked(address(usdc), uint24(500), address(btc)),
            none
        );
        address[] memory v2 = new address[](2);
        v2[0] = address(usdc);
        v2[1] = address(joe);
        packs.addAsset(
            IERC20Metadata(address(joe)), IAggregatorV3(address(joeFeed)), 1 days, 600, CollectPacks.Route.V2, "", v2
        );
        vm.stopPrank();

        usdc.mint(alice, u(100e6));
        usdc.mint(bob, u(100e6));
        usdc.mint(owner, u(1_000e6));
        vm.prank(alice);
        usdc.approve(address(packs), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(packs), type(uint256).max);
    }

    function _seed(uint256 amount) internal {
        vm.prank(owner);
        usdc.transfer(address(packs), amount);
    }

    function _buy(address who, uint256 tierId, uint256 qty) internal returns (uint256 first) {
        vm.prank(who);
        first = packs.buy(tierId, qty);
    }

    function _open(address who, uint256 packId, bytes32 hash) internal returns (uint256 cardId) {
        (, uint64 revealBlock,,,) = packs.packs(packId);
        vm.roll(revealBlock + 1);
        vm.setBlockhash(revealBlock, hash);
        vm.prank(who);
        cardId = packs.open(packId);
    }

    // ------------------------------------------------------------ gifts

    uint256 constant GIFT_KEY = 0xC0FFEE;

    function _giftSig(uint256 key, uint256 giftId, address to) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", packs.giftMessage(giftId, to)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_giftBuyReservesAndClaimIssuesFreshPacks() public {
        _seed(u(20e6));
        vm.prank(alice);
        uint256 giftId = packs.buyGift(2, 2, vm.addr(GIFT_KEY));
        assertEq(usdc.balanceOf(alice), u(98e6));
        assertEq(packs.packReserve(), 2 * packs.maxPayout(2)); // reserved at purchase
        assertEq(packs.packIdsOf(alice).length, 0); // no packs until claimed

        vm.roll(vm.getBlockNumber() + 1000); // long after purchase: claim still gets fresh randomness
        bytes memory sig = _giftSig(GIFT_KEY, giftId, bob);
        vm.prank(bob);
        uint256 first = packs.claimGift(giftId, sig);
        assertEq(packs.packIdsOf(bob).length, 2);
        (address owner_, uint64 revealBlock, uint8 tier_,, uint128 paid) = packs.packs(first);
        assertEq(owner_, bob);
        assertEq(revealBlock, vm.getBlockNumber() + 1);
        assertEq(tier_, 2);
        assertEq(paid, u(1e6));
        assertEq(packs.packState(first), 1); // waiting, not expired
        assertEq(packs.packReserve(), 2 * packs.maxPayout(2)); // not double counted

        _open(bob, first, keccak256("gift")); // bob opens normally

        vm.prank(bob);
        vm.expectRevert(CollectPacks.GiftDone.selector);
        packs.claimGift(giftId, sig);
    }

    function test_giftSignatureIsBoundToTheClaimer() public {
        _seed(u(10e6));
        vm.prank(alice);
        uint256 giftId = packs.buyGift(1, 1, vm.addr(GIFT_KEY));
        // Signatures are built first: the view call inside _giftSig would consume expectRevert.
        bytes memory forBob = _giftSig(GIFT_KEY, giftId, bob);
        bytes memory wrongKey = _giftSig(0xBAD, giftId, bob);
        bytes memory unknownGift = _giftSig(GIFT_KEY, 99, bob);
        // A signature made for bob can't be replayed by someone watching the mempool.
        vm.prank(treasury);
        vm.expectRevert(CollectPacks.BadGiftCode.selector);
        packs.claimGift(giftId, forBob);
        // The wrong key, an unknown gift, and junk bytes are refused too.
        vm.prank(bob);
        vm.expectRevert(CollectPacks.BadGiftCode.selector);
        packs.claimGift(giftId, wrongKey);
        vm.prank(bob);
        vm.expectRevert(CollectPacks.BadGiftCode.selector);
        packs.claimGift(99, unknownGift);
        vm.prank(bob);
        vm.expectRevert(CollectPacks.BadGiftCode.selector);
        packs.claimGift(giftId, hex"1234");
        vm.prank(bob);
        packs.claimGift(giftId, forBob);
    }

    function test_cancelGiftReturnsPacksToSenderOnce() public {
        _seed(u(10e6));
        vm.prank(alice);
        uint256 giftId = packs.buyGift(1, 3, vm.addr(GIFT_KEY));
        vm.prank(bob);
        vm.expectRevert(CollectPacks.NotYourGift.selector);
        packs.cancelGift(giftId);
        vm.prank(alice);
        packs.cancelGift(giftId);
        assertEq(packs.packIdsOf(alice).length, 3);
        bytes memory sig = _giftSig(GIFT_KEY, giftId, bob);
        vm.prank(bob);
        vm.expectRevert(CollectPacks.GiftDone.selector);
        packs.claimGift(giftId, sig);
        vm.prank(alice);
        vm.expectRevert(CollectPacks.GiftDone.selector);
        packs.cancelGift(giftId);
    }

    function test_giftValidationAndPause() public {
        _seed(u(10e6));
        vm.startPrank(alice);
        vm.expectRevert(CollectPacks.ZeroAddress.selector);
        packs.buyGift(1, 1, address(0));
        vm.expectRevert(CollectPacks.BadQuantity.selector);
        packs.buyGift(1, 11, vm.addr(GIFT_KEY));
        uint256 giftId = packs.buyGift(1, 1, vm.addr(GIFT_KEY));
        assertEq(packs.giftIdOf(vm.addr(GIFT_KEY)), giftId); // the code alone finds its gift
        vm.expectRevert(CollectPacks.GiftCodeUsed.selector); // each code's key is used once
        packs.buyGift(1, 1, vm.addr(GIFT_KEY));
        vm.stopPrank();

        vm.prank(owner);
        packs.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        packs.buyGift(1, 1, vm.addr(GIFT_KEY));
        // Claiming still works while paused, and the claimed pack can be refunded.
        bytes memory sig = _giftSig(GIFT_KEY, giftId, bob);
        vm.prank(bob);
        uint256 first = packs.claimGift(giftId, sig);
        vm.prank(bob);
        packs.refund(first);
        assertEq(usdc.balanceOf(bob), u(101e6)); // bob gets the $1 alice paid
        assertEq(packs.reserved(), 0);
    }

    // ------------------------------------------------------------ buying

    function test_buyPullsPriceAndReservesTopPayout() public {
        _seed(u(10e6));
        uint256 first = _buy(alice, 1, 2);
        assertEq(usdc.balanceOf(alice), u(98e6));
        assertEq(packs.packReserve(), u(8e6)); // 2 x $4 top payout
        assertEq(packs.reserved(), u(8e6));
        assertEq(packs.surplus(), u(12e6) - u(8e6));
        (address o,, uint8 t, bool done, uint128 paid) = packs.packs(first);
        assertEq(o, alice);
        assertEq(t, 1);
        assertFalse(done);
        assertEq(paid, u(1e6));
        assertEq(packs.packIdsOf(alice).length, 2);
    }

    function test_saleRevertsWhenPoolCannotCoverTopPayout() public {
        // Empty pool: a $1 Classic pack can owe $4.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CollectPacks.PoolTooSmall.selector, u(1e6), u(4e6)));
        packs.buy(1, 1);
        // Realistic's top payout is $1.34: still needs a $0.34 seed.
        _seed(u(0.34e6));
        _buy(alice, 0, 1);
    }

    function test_capacity() public {
        _seed(u(30.39e6)); // 3 Futuristic packs: each adds $1 and reserves $10.13
        assertEq(packs.capacity(2), 3);
        _buy(alice, 2, 3);
        assertEq(packs.capacity(2), 0);
        vm.prank(alice);
        vm.expectRevert();
        packs.buy(2, 1);
    }

    function test_badQuantityAndTier() public {
        _seed(u(100e6));
        vm.startPrank(alice);
        vm.expectRevert(CollectPacks.BadQuantity.selector);
        packs.buy(0, 0);
        vm.expectRevert(CollectPacks.BadQuantity.selector);
        packs.buy(0, 11);
        vm.expectRevert(CollectPacks.BadTier.selector);
        packs.buy(9, 1);
        vm.stopPrank();
        vm.prank(owner);
        packs.setTierActive(0, false);
        vm.prank(alice);
        vm.expectRevert(CollectPacks.BadTier.selector);
        packs.buy(0, 1);
    }

    // ------------------------------------------------------------ opening

    function test_openSwapsIntoTokenAndLocksIt() public {
        _seed(u(10e6));
        uint256 id = _buy(alice, 1, 1);
        vm.prank(alice);
        vm.expectRevert(CollectPacks.RevealNotReady.selector);
        packs.open(id);

        uint256 cardId = _open(alice, id, keccak256("seed"));
        assertEq(packs.ownerOf(cardId), alice);
        (uint8 a,, uint8 rarity, bool filled, uint128 usd, uint256 amount) = packs.cards(cardId);
        assertTrue(filled);
        assertEq(usd, backingClassic[rarity]);
        address token = a == 0 ? address(btc) : address(joe);
        assertEq(amount, packs.fairAmount(a, usd));
        assertEq(packs.lockedOf(token), amount);
        assertEq(MockToken(token).balanceOf(address(packs)), amount);
        assertEq(packs.packReserve(), 0);
        assertEq(packs.pendingUsdc(), 0);
        // Pool paid the card's value out of the $11.
        assertEq(usdc.balanceOf(address(packs)), u(11e6) - usd);
    }

    function test_onlyOwnerOpensAndOnlyOnce() public {
        _seed(u(10e6));
        uint256 id = _buy(alice, 1, 1);
        vm.roll(vm.getBlockNumber() + 2);
        vm.prank(bob);
        vm.expectRevert(CollectPacks.NotYourPack.selector);
        packs.open(id);
        _open(alice, id, keccak256("x"));
        vm.prank(alice);
        vm.expectRevert(CollectPacks.PackDone.selector);
        packs.open(id);
    }

    function test_expiredPackOpensAsLowestRarity() public {
        _seed(u(10e6));
        uint256 id = _buy(alice, 2, 1);
        vm.roll(vm.getBlockNumber() + 300); // past the 256-block window
        assertEq(packs.packState(id), 3);
        vm.prank(alice);
        uint256 cardId = packs.open(id);
        (,, uint8 rarity,, uint128 usd,) = packs.cards(cardId);
        assertEq(rarity, 0);
        assertEq(usd, u(0.2e6));
    }

    function test_raritiesFollowOdds() public {
        _seed(u(1_000e6));
        usdc.mint(alice, u(1_000e6));
        uint256[4] memory counts;
        for (uint256 i; i < 400; ++i) {
            uint256 id = _buy(alice, 1, 1);
            uint256 cardId = _open(alice, id, keccak256(abi.encode(i)));
            (,, uint8 rarity,,,) = packs.cards(cardId);
            counts[rarity]++;
        }
        // 50/25/20/5 over 400 draws, with generous bounds.
        assertGt(counts[0], 160);
        assertLt(counts[0], 240);
        assertGt(counts[1], 70);
        assertGt(counts[2], 50);
        assertGt(counts[3], 5);
        assertLt(counts[3], 40);
    }

    // ------------------------------------------------------------ swap failures

    function test_swapFailureLeavesCardHoldingUsdcThenFill() public {
        _seed(u(10e6));
        router.setBroken(true);
        uint256 id = _buy(alice, 1, 1);
        uint256 cardId = _open(alice, id, keccak256("seed"));
        (,,, bool filled, uint128 usd,) = packs.cards(cardId);
        assertFalse(filled);
        assertEq(packs.pendingUsdc(), usd);
        assertEq(packs.reserved(), usd);

        vm.expectRevert(CollectPacks.SwapUnavailable.selector);
        packs.fill(cardId);

        router.setBroken(false);
        vm.prank(bob); // anyone can fill
        packs.fill(cardId);
        (,,, filled,,) = packs.cards(cardId);
        assertTrue(filled);
        assertEq(packs.pendingUsdc(), 0);
        vm.expectRevert(CollectPacks.AlreadyFilled.selector);
        packs.fill(cardId);
    }

    function test_pushedPoolIsRefused() public {
        _seed(u(10e6));
        router.setHaircut(1_500); // DEX gives 15% less than Chainlink: worse than any tolerance
        uint256 id = _buy(alice, 1, 1);
        uint256 cardId = _open(alice, id, keccak256("seed"));
        (,,, bool filled,,) = packs.cards(cardId);
        assertFalse(filled);
    }

    function test_staleFeedIsRefused() public {
        _seed(u(10e6));
        btcFeed.set(60_000e8, vm.getBlockTimestamp() - 2 days);
        joeFeed.set(0.02e8, vm.getBlockTimestamp() - 2 days);
        uint256 id = _buy(alice, 1, 1);
        uint256 cardId = _open(alice, id, keccak256("seed"));
        (,,, bool filled,,) = packs.cards(cardId);
        assertFalse(filled);
    }

    // ------------------------------------------------------------ redeem

    function test_redeemFilledCardPaysTokens() public {
        _seed(u(10e6));
        uint256 cardId = _open(alice, _buy(alice, 1, 1), keccak256("seed"));
        (uint8 a,,,,, uint256 amount) = packs.cards(cardId);
        MockToken token = a == 0 ? btc : joe;
        vm.prank(bob);
        vm.expectRevert(CollectPacks.NotYourCard.selector);
        packs.redeem(cardId);
        vm.prank(alice);
        packs.redeem(cardId);
        assertEq(token.balanceOf(alice), amount);
        assertEq(packs.lockedOf(address(token)), 0);
        vm.expectRevert();
        packs.ownerOf(cardId);
        // Burned, but its record stays for the profile.
        uint256[] memory redeemed = packs.redeemedOf(alice);
        assertEq(redeemed.length, 1);
        assertEq(redeemed[0], cardId);
        (uint8 a2,,, bool filled,, uint256 amount2) = packs.cards(cardId);
        assertEq(a2, a);
        assertTrue(filled);
        assertEq(amount2, amount);
        assertEq(packs.redeemedOf(bob).length, 0);
        // A burned card can't be filled, staked or redeemed again.
        vm.expectRevert();
        packs.fill(cardId);
    }

    function test_redeemUnfilledCardPaysUsdc() public {
        _seed(u(10e6));
        router.setBroken(true);
        uint256 cardId = _open(alice, _buy(alice, 1, 1), keccak256("seed"));
        (,,,, uint128 usd,) = packs.cards(cardId);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        packs.redeem(cardId);
        assertEq(usdc.balanceOf(alice), before + usd);
        assertEq(packs.pendingUsdc(), 0);
    }

    // ------------------------------------------------------------ treasury

    function test_withdrawOnlySurplus() public {
        _seed(u(10e6));
        _buy(alice, 1, 2); // balance 12, reserved 8
        assertEq(packs.surplus(), u(4e6));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        packs.withdraw(alice, 1);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CollectPacks.ExceedsSurplus.selector, u(4e6) + 1, u(4e6)));
        packs.withdraw(treasury, u(4e6) + 1);

        vm.prank(owner);
        packs.withdraw(treasury, u(3e6));
        assertEq(usdc.balanceOf(treasury), u(3e6));
        vm.prank(owner);
        assertEq(packs.withdrawAll(treasury), u(1e6));
        assertEq(packs.surplus(), 0);
        assertEq(usdc.balanceOf(address(packs)), u(8e6)); // exactly what's owed stays
    }

    function test_surplusGrowsAsPacksOpen() public {
        _seed(u(10e6));
        uint256 id = _buy(alice, 1, 1); // balance 11, reserved 4 -> surplus 7
        assertEq(packs.surplus(), u(7e6));
        uint256 cardId = _open(alice, id, keccak256("seed"));
        (,,,, uint128 usd,) = packs.cards(cardId);
        // Reserve released; card value left the pool as tokens.
        assertEq(packs.surplus(), u(11e6) - usd);
    }

    function test_pauseRefundThenWithdrawEverything() public {
        _seed(u(20e6)); // one Futuristic + one Classic can owe $14.13
        uint256 a1 = _buy(alice, 2, 1);
        uint256 b1 = _buy(bob, 1, 1);

        vm.prank(alice);
        vm.expectRevert(Pausable.ExpectedPause.selector);
        packs.refund(a1);

        vm.prank(owner);
        packs.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        packs.buy(1, 1);

        vm.prank(bob);
        vm.expectRevert(CollectPacks.NotYourPack.selector);
        packs.refund(a1);

        vm.prank(alice);
        packs.refund(a1);
        vm.prank(bob);
        packs.refund(b1);
        assertEq(usdc.balanceOf(alice), u(100e6));
        assertEq(usdc.balanceOf(bob), u(100e6));
        assertEq(packs.reserved(), 0);

        vm.prank(owner);
        assertEq(packs.withdrawAll(treasury), u(20e6)); // the whole seed comes back
        assertEq(usdc.balanceOf(address(packs)), 0);

        vm.prank(alice);
        vm.expectRevert(CollectPacks.PackDone.selector);
        packs.refund(a1);
    }

    function test_openStillWorksWhilePaused() public {
        _seed(u(10e6));
        uint256 id = _buy(alice, 1, 1);
        vm.prank(owner);
        packs.pause();
        _open(alice, id, keccak256("seed")); // players can always open what they bought
    }

    function test_rescueNeverTouchesUsdcOrLockedTokens() public {
        _seed(u(10e6));
        uint256 cardId = _open(alice, _buy(alice, 1, 1), keccak256("seed"));
        (uint8 a,,,,, uint256 amount) = packs.cards(cardId);
        MockToken token = a == 0 ? btc : joe;
        token.mint(address(packs), 5); // sent by mistake

        vm.startPrank(owner);
        vm.expectRevert(CollectPacks.ProtectedToken.selector);
        packs.rescue(usdc, treasury);
        assertEq(packs.rescue(token, treasury), 5);
        assertEq(packs.rescue(token, treasury), 0);
        vm.stopPrank();
        assertEq(token.balanceOf(address(packs)), amount);
    }

    function test_ownershipTransferIsTwoStep() public {
        vm.prank(owner);
        packs.transferOwnership(treasury);
        assertEq(packs.owner(), owner);
        vm.prank(treasury);
        packs.acceptOwnership();
        assertEq(packs.owner(), treasury);
    }

    // ------------------------------------------------------------ config guards

    function test_tierValidation() public {
        vm.startPrank(owner);
        vm.expectRevert(CollectPacks.BadTier.selector);
        packs.addTier(u128(1e6), [uint16(5000), 2500, 2000, 400], backingClassic); // odds sum 9,900
        vm.expectRevert(CollectPacks.BadTier.selector);
        packs.addTier(u128(1e6), oddsClassic, [uint128(1), 1, 1, u128(2_000e6)]); // over $1,000
        vm.stopPrank();
    }

    function test_assetPathMustRunUsdcToToken() public {
        address[] memory none;
        vm.startPrank(owner);
        vm.expectRevert(CollectPacks.BadAsset.selector);
        packs.setAsset(
            0,
            IAggregatorV3(address(btcFeed)),
            1 days,
            200,
            CollectPacks.Route.UniswapV3,
            abi.encodePacked(address(joe), uint24(500), address(btc)),
            none
        );
        vm.expectRevert(CollectPacks.BadAsset.selector);
        packs.setAsset(
            0,
            IAggregatorV3(address(btcFeed)),
            1 days,
            2_000,
            CollectPacks.Route.UniswapV3,
            abi.encodePacked(address(usdc), uint24(500), address(btc)),
            none
        );
        vm.stopPrank();
    }

    function test_expectedBackingIs91Cents() public view {
        assertEq(packs.expectedBacking(0), u(0.91e6));
        assertEq(packs.expectedBacking(1), u(0.91e6));
        assertApproxEqAbs(packs.expectedBacking(2), u(0.91e6), u(0.0001e6));
    }

    // ------------------------------------------------------------ revenue sharing

    address staking = makeAddr("staking");
    address dao = makeAddr("dao");

    /// A Realistic-style tier: every card is worth `value`, whatever its rarity.
    function _flatTier(uint256 value6) internal returns (uint256 tierId) {
        vm.prank(owner);
        packs.addTier(u128(1e6), oddsClassic, [u128(value6), u128(value6), u128(value6), u128(value6)]);
        tierId = packs.tierCount() - 1;
    }

    function _buyAndOpen(address who, uint256 tierId, uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            uint256 id = _buy(who, tierId, 1);
            _open(who, id, keccak256(abi.encode("rev", tierId, i)));
        }
    }

    function _shares(uint16 stakingBps, uint16 daoBps) internal {
        vm.prank(owner);
        packs.setShares(staking, stakingBps, dao, daoBps);
    }

    function test_flatTierEdgeIsRevenueAndNeedsNoSeed() public {
        uint256 flat = _flatTier(0.95e6);
        _buyAndOpen(alice, flat, 4);
        assertEq(packs.pendingRevenue(), int256(u(0.2e6)));
        assertEq(packs.surplus(), u(0.2e6));
        assertEq(packs.ownerFree(), 0);
        // No shares set: distributing hands it all to the owner.
        assertEq(packs.distribute(), u(0.2e6));
        assertEq(packs.pendingRevenue(), 0);
        assertEq(packs.ownerFree(), u(0.2e6));
    }

    function test_distributeSendsSharesAndAnyoneCanCall() public {
        _shares(5000, 3000);
        uint256 flat = _flatTier(0.95e6);
        _buyAndOpen(alice, flat, 10); // $0.50 revenue
        vm.prank(bob);
        assertEq(packs.distribute(), u(0.5e6));
        assertEq(usdc.balanceOf(staking), u(0.25e6));
        assertEq(usdc.balanceOf(dao), u(0.15e6));
        vm.prank(owner);
        assertEq(packs.withdrawAll(treasury), u(0.1e6));
        assertEq(packs.distribute(), 0); // nothing left to share
    }

    function test_withdrawSharesPendingRevenueFirst() public {
        _shares(5000, 3000);
        uint256 flat = _flatTier(0.95e6);
        _buyAndOpen(alice, flat, 10);
        vm.prank(owner);
        assertEq(packs.withdrawAll(treasury), u(0.1e6));
        assertEq(usdc.balanceOf(staking), u(0.25e6));
        assertEq(usdc.balanceOf(dao), u(0.15e6));
    }

    function test_ownerCannotTakeRevenueHeldBackByBankroll() public {
        _shares(5000, 3000);
        _seed(u(1e6)); // owner's own money
        uint256 flat = _flatTier(0.95e6);
        _buyAndOpen(alice, flat, 10); // surplus 1.5, revenue 0.5
        vm.prank(owner);
        packs.setMinBankroll(u(1.4e6)); // only 0.1 may be shared now
        assertEq(packs.distributable(), u(0.1e6));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CollectPacks.ExceedsSurplus.selector, u(1.1e6), u(1.02e6)));
        packs.withdraw(treasury, u(1.1e6)); // shares 0.1 first (owner keeps 0.02); 0.4 revenue still held back
        vm.prank(owner);
        assertEq(packs.withdrawAll(treasury), u(1.02e6)); // seed plus the owner's 20%; held-back revenue stays
        assertEq(uint256(packs.pendingRevenue()), u(0.4e6));
        assertEq(usdc.balanceOf(staking), u(0.05e6));
    }

    function test_lossesAreMadeBackBeforeSharing() public {
        _shares(5000, 3000);
        _seed(u(2e6));
        uint256 losing = _flatTier(1.5e6);
        uint256 flat = _flatTier(0.95e6);
        _buyAndOpen(alice, losing, 1); // pool pays out $0.50 more than it took
        assertEq(packs.pendingRevenue(), -int256(u(0.5e6)));
        assertEq(packs.distributable(), 0);
        usdc.mint(bob, u(1e6));
        vm.prank(bob);
        packs.addRevenue(u(0.3e6));
        assertEq(packs.pendingRevenue(), -int256(u(0.2e6)));
        _buyAndOpen(alice, flat, 5); // +0.25
        assertEq(packs.pendingRevenue(), int256(u(0.05e6)));
        assertEq(packs.distribute(), u(0.05e6));
        assertEq(usdc.balanceOf(staking), u(0.025e6));
    }

    function test_setSharesValidatesAndSharesOnOldTermsFirst() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        packs.setShares(staking, 1, dao, 1);
        vm.startPrank(owner);
        vm.expectRevert(CollectPacks.BadShares.selector);
        packs.setShares(staking, 6000, dao, 4001);
        vm.expectRevert(CollectPacks.BadShares.selector);
        packs.setShares(address(0), 100, dao, 0);
        vm.expectRevert(CollectPacks.BadShares.selector);
        packs.setShares(staking, 0, address(0), 100);
        vm.stopPrank();

        uint256 flat = _flatTier(0.95e6);
        _buyAndOpen(alice, flat, 4); // earned before staking existed
        _shares(5000, 3000);
        assertEq(usdc.balanceOf(staking), 0); // that revenue went to the owner, as the terms then said
        assertEq(packs.ownerFree(), u(0.2e6));
        assertEq(packs.stakingBps(), 5000);
        assertEq(packs.daoSink(), dao);
    }

    function test_addRevenuePullsUsdc() public {
        vm.prank(alice);
        packs.addRevenue(u(2e6));
        assertEq(usdc.balanceOf(address(packs)), u(2e6));
        assertEq(packs.pendingRevenue(), int256(u(2e6)));
    }
}

/// The same suite with 18-decimal USDC, as on BNB Smart Chain.
contract CollectPacks18Test is CollectPacksTest {
    function _usdcDecimals() internal pure override returns (uint8) {
        return 18;
    }

    function test_usdcDecimalsAndBackingCap() public view {
        assertEq(packs.usdcDecimals(), 18);
        assertEq(packs.MAX_BACKING(), 1_000e18);
        assertEq(packs.tier(2).backing[3], 10.13e18); // past uint64's ~18.4e18
    }

    function test_fairAmountUses18Decimals() public view {
        // $1 of BTC at $60,000 = 1/60,000 BTC = 1666 sats (8 decimals)
        assertEq(packs.fairAmount(0, 1e18), 1666);
        // $1 of an 18-decimal token at $0.02 = 50 tokens
        assertEq(packs.fairAmount(1, 1e18), 50e18);
    }
}
