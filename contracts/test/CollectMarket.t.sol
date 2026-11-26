// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {CollectPacks, IAggregatorV3, ISwapRouter02, IV2Router} from "../src/CollectPacks.sol";
import {CollectMarket} from "../src/CollectMarket.sol";
import {MockFeed, MockRouter, MockToken} from "./Mocks.sol";

contract CollectMarketTest is Test {
    CollectPacks packs;
    CollectMarket market;
    MockToken usdc;
    MockToken btc;

    address owner = makeAddr("owner");
    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");
    address other = makeAddr("other");

    uint256 card; // seller's card

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockToken("USDC", 6);
        btc = new MockToken("BTC.b", 8);
        MockFeed feed = new MockFeed(60_000e8);
        MockRouter router = new MockRouter(usdc);
        router.setPrice(address(btc), 60_000e8, 8);

        packs = new CollectPacks(usdc, ISwapRouter02(address(router)), IV2Router(address(router)), owner);
        // Fees land in the pack pool, where the owner withdraws them as surplus.
        market = new CollectMarket(usdc, address(packs), owner);
        vm.startPrank(owner);
        packs.addTier(1e6, [uint16(5000), 2500, 2000, 500], [uint128(0.46e6), 0.8e6, 1.4e6, 4e6]);
        address[] memory none;
        packs.addAsset(
            IERC20Metadata(address(btc)),
            IAggregatorV3(address(feed)),
            1 days,
            200,
            CollectPacks.Route.UniswapV3,
            abi.encodePacked(address(usdc), uint24(500), address(btc)),
            none
        );
        market.setListable(address(packs), true);
        vm.stopPrank();

        usdc.mint(address(packs), 10e6);
        usdc.mint(seller, 10e6);
        usdc.mint(buyer, 100e6);
        vm.prank(seller);
        usdc.approve(address(packs), type(uint256).max);
        vm.prank(buyer);
        usdc.approve(address(market), type(uint256).max);

        vm.prank(seller);
        uint256 packId = packs.buy(0, 1);
        vm.roll(vm.getBlockNumber() + 2);
        vm.setBlockhash(vm.getBlockNumber() - 1, keccak256("h"));
        vm.prank(seller);
        card = packs.open(packId);
    }

    function _list(uint256 price) internal {
        vm.startPrank(seller);
        packs.setApprovalForAll(address(market), true);
        market.list(address(packs), card, price, false, uint64(vm.getBlockTimestamp() + 7 days));
        vm.stopPrank();
    }

    function test_listAndBuyPaysSellerAndFee() public {
        _list(5e6);
        assertTrue(market.isValid(address(packs), card));
        uint256 sellerBefore = usdc.balanceOf(seller);
        uint256 poolBefore = usdc.balanceOf(address(packs));

        vm.prank(buyer);
        market.buy(address(packs), card, false, 5e6);

        assertEq(packs.ownerOf(card), buyer);
        assertEq(usdc.balanceOf(seller) - sellerBefore, 4.95e6); // 99%
        assertEq(usdc.balanceOf(address(packs)) - poolBefore, 0.05e6); // 1% into the pool
        assertEq(usdc.balanceOf(buyer), 95e6);
        assertEq(usdc.balanceOf(address(market)), 0); // never holds funds
        assertEq(market.listingCount(), 0);
        // The fee is withdrawable surplus for the owner.
        assertGe(packs.surplus(), 0.05e6);
    }

    function test_buyerGetsTheTokensInside() public {
        _list(5e6);
        vm.prank(buyer);
        market.buy(address(packs), card, false, 5e6);
        (,,,,, uint256 amount) = packs.cards(card);
        vm.prank(buyer);
        packs.redeem(card);
        assertEq(btc.balanceOf(buyer), amount);
    }

    function test_listingNeedsOwnershipApprovalAndListableCollection() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.NotOwner.selector, address(packs), card));
        market.list(address(packs), card, 1e6, false, uint64(vm.getBlockTimestamp() + 1 days));

        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.NotApproved.selector, address(packs)));
        market.list(address(packs), card, 1e6, false, uint64(vm.getBlockTimestamp() + 1 days));

        vm.prank(owner);
        market.setListable(address(packs), false);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.NotListable.selector, address(packs)));
        market.list(address(packs), card, 1e6, false, uint64(vm.getBlockTimestamp() + 1 days));
    }

    function test_termsAreChecked() public {
        vm.startPrank(seller);
        packs.setApprovalForAll(address(market), true);
        vm.expectRevert(CollectMarket.ZeroPrice.selector);
        market.list(address(packs), card, 0, false, uint64(vm.getBlockTimestamp() + 1 days));
        vm.expectRevert();
        market.list(address(packs), card, 1e6, false, uint64(vm.getBlockTimestamp() + 10 minutes));
        vm.expectRevert();
        market.list(address(packs), card, 1e6, false, uint64(vm.getBlockTimestamp() + 31 days));
        vm.stopPrank();
    }

    function test_priceGuardAndOwnListing() public {
        _list(5e6);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.PriceAboveMax.selector, 5e6, 4e6));
        market.buy(address(packs), card, false, 4e6);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.OwnListing.selector, address(packs), card));
        market.buy(address(packs), card, false, 5e6);
    }

    function test_relistAndCancel() public {
        _list(5e6);
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.NotSeller.selector, address(packs), card));
        market.relist(address(packs), card, 1e6, false, uint64(vm.getBlockTimestamp() + 1 days));

        vm.prank(seller);
        market.relist(address(packs), card, 3e6, false, uint64(vm.getBlockTimestamp() + 2 days));
        (, uint256 price,,) = market.listings(address(packs), card);
        assertEq(price, 3e6);

        vm.prank(seller);
        market.cancel(address(packs), card);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.NotListed.selector, address(packs), card));
        market.buy(address(packs), card, false, 3e6);
    }

    function test_listingDiesWhenCardMovesOrIsRedeemed() public {
        _list(5e6);
        vm.prank(seller);
        packs.transferFrom(seller, other, card);
        assertFalse(market.isValid(address(packs), card));
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.ListingInvalid.selector, address(packs), card));
        market.buy(address(packs), card, false, 5e6);

        // Anyone can sweep it.
        address[] memory nfts = new address[](1);
        uint256[] memory ids = new uint256[](1);
        nfts[0] = address(packs);
        ids[0] = card;
        market.clearInvalid(nfts, ids);
        assertEq(market.listingCount(), 0);
    }

    function test_redeemedCardListingIsInvalid() public {
        _list(5e6);
        vm.prank(seller);
        packs.redeem(card);
        assertFalse(market.isValid(address(packs), card));
    }

    function test_expiredListingCannotBeBought() public {
        _list(5e6);
        vm.warp(vm.getBlockTimestamp() + 8 days);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.ListingExpired.selector, address(packs), card));
        market.buy(address(packs), card, false, 5e6);
    }

    function test_revokedApprovalKillsListing() public {
        _list(5e6);
        vm.prank(seller);
        packs.setApprovalForAll(address(market), false);
        assertFalse(market.isValid(address(packs), card));
    }

    function test_adminFeeAndTreasury() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        market.setFee(200);
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.FeeTooHigh.selector, 1_001));
        market.setFee(1_001);
        market.setFee(0);
        vm.expectRevert(CollectMarket.InvalidTreasury.selector);
        market.setTreasury(address(0), false);
        market.setTreasury(other, false);
        vm.stopPrank();

        _list(5e6);
        vm.prank(buyer);
        market.buy(address(packs), card, false, 5e6);
        assertEq(usdc.balanceOf(other), 0); // zero fee: nothing to the treasury
    }

    // ------------------------------------------------------------ AVAX listings

    function _listAvax(uint256 price) internal {
        vm.startPrank(seller);
        packs.setApprovalForAll(address(market), true);
        market.list(address(packs), card, price, true, uint64(vm.getBlockTimestamp() + 7 days));
        vm.stopPrank();
    }

    function test_avaxListingPaysSellerInAvaxAndKeepsFee() public {
        _listAvax(2 ether);
        vm.deal(buyer, 5 ether);
        uint256 sellerBefore = seller.balance;

        vm.prank(buyer);
        market.buy{value: 2 ether}(address(packs), card, true, 2 ether);

        assertEq(packs.ownerOf(card), buyer);
        assertEq(seller.balance - sellerBefore, 1.98 ether); // 99%
        assertEq(market.avaxFees(), 0.02 ether); // 1% held for the owner
        assertEq(address(market).balance, 0.02 ether); // only the fees
        assertEq(buyer.balance, 3 ether);
        assertEq(usdc.balanceOf(buyer), 100e6); // no USDC touched
    }

    function test_avaxBuyNeedsExactValue() public {
        _listAvax(2 ether);
        vm.deal(buyer, 5 ether);
        vm.startPrank(buyer);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.BadValue.selector, 2 ether, 1 ether));
        market.buy{value: 1 ether}(address(packs), card, true, 2 ether);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.BadValue.selector, 2 ether, 3 ether));
        market.buy{value: 3 ether}(address(packs), card, true, 2 ether);
        vm.stopPrank();
    }

    function test_usdcBuyRejectsAvax() public {
        _list(5e6);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(CollectMarket.BadValue.selector, 0, 1));
        market.buy{value: 1}(address(packs), card, false, 5e6);
    }

    function test_currencySwitchCannotCatchBuyer() public {
        // Buyer expects USDC; seller switches the listing to AVAX just before.
        _list(5e6);
        vm.prank(seller);
        market.relist(address(packs), card, 5e6, true, uint64(vm.getBlockTimestamp() + 1 days));
        vm.prank(buyer);
        vm.expectRevert(CollectMarket.WrongCurrency.selector);
        market.buy(address(packs), card, false, 5e6);
        (,, bool inAvax,) = market.listings(address(packs), card);
        assertTrue(inAvax);
    }

    function test_withdrawAvaxFees() public {
        _listAvax(2 ether);
        vm.deal(buyer, 5 ether);
        vm.prank(buyer);
        market.buy{value: 2 ether}(address(packs), card, true, 2 ether);

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, other));
        market.withdrawAvaxFees(payable(other));

        vm.prank(owner);
        assertEq(market.withdrawAvaxFees(payable(other)), 0.02 ether);
        assertEq(other.balance, 0.02 ether);
        assertEq(market.avaxFees(), 0);
        assertEq(address(market).balance, 0);
    }

    function test_sellerThatRejectsAvaxCannotSell() public {
        // A seller contract with no way to receive AVAX: the sale reverts, nothing moves.
        RejectsAvax rejecter = new RejectsAvax();
        vm.prank(seller);
        packs.transferFrom(seller, address(rejecter), card);
        vm.startPrank(address(rejecter));
        packs.setApprovalForAll(address(market), true);
        market.list(address(packs), card, 1 ether, true, uint64(vm.getBlockTimestamp() + 1 days));
        vm.stopPrank();

        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        vm.expectRevert(CollectMarket.AvaxTransferFailed.selector);
        market.buy{value: 1 ether}(address(packs), card, true, 1 ether);
        assertEq(packs.ownerOf(card), address(rejecter));
        assertEq(buyer.balance, 1 ether);
    }

    function test_usdcFeesBecomePoolRevenue() public {
        vm.prank(owner);
        market.setTreasury(address(packs), true);
        int256 before = packs.pendingRevenue();
        _list(5e6);
        vm.prank(buyer);
        market.buy(address(packs), card, false, 5e6);
        assertEq(packs.pendingRevenue() - before, 0.05e6);
        assertEq(usdc.balanceOf(address(market)), 0);
        assertEq(usdc.allowance(address(market), address(packs)), 0);
    }
}

contract RejectsAvax {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
