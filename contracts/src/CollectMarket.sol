// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// The pack pool: takes USDC fees as revenue it shares with staking and the DAO.
interface IRevenuePool {
    function addRevenue(uint256 amount) external;
}

/// @title Grailio market: peer-to-peer card sales, priced in BNB or USDC.
/// @notice Each listing is priced in the currency the seller picks, BNB or
/// USDC. The buyer pays in that currency and the seller receives it directly;
/// nothing is swapped.
///
/// Non-custodial. A listed card stays in the seller's wallet and only moves
/// when it sells. The seller approves this market once (`setApprovalForAll`);
/// a listing is just a record with a price, currency and expiry. A listing can
/// be bought only while it hasn't expired, the seller still owns the card and
/// the market is still approved.
///
/// The one rule that makes the blanket approval safe: the only NFT transfer
/// this contract ever makes is seller -> buyer inside `buy`, for that seller's
/// own valid listing.
///
/// Fees: USDC fees go to `treasury`; when it is the pack pool (`treasuryIsPool`)
/// they are added as revenue there, shared out by its `distribute`. BNB fees collect here (the pack
/// pool can't take BNB) and the owner sends them out with `withdrawAvaxFees`.
/// That is the only BNB this contract ever holds.
contract CollectMarket is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 1_000; // 10%
    uint256 public constant MIN_DURATION = 1 hours;
    uint256 public constant MAX_DURATION = 30 days;

    IERC20 public immutable usdc;
    /// Where USDC fees go.
    address public treasury;
    /// True when `treasury` is the pack pool: fees go in through `addRevenue`.
    bool public treasuryIsPool;
    /// 1% by default, on both currencies.
    uint256 public feeBps = 100;
    /// BNB fees collected, withdrawable by the owner.
    uint256 public avaxFees;
    /// Collections that can be listed (CollectPacks cards).
    mapping(address nft => bool) public listable;

    struct Listing {
        address seller;
        uint96 price; // BNB: wei (18 dec). USDC: its own decimals (18 on BNB Chain; uint96 holds ~79e9 USDC).
        address nft;
        uint64 expiresAt;
        bool inAvax;
        uint256 tokenId;
    }

    mapping(bytes32 key => Listing) private _listings;
    EnumerableSet.Bytes32Set private _keys;

    error NotListable(address nft);
    error NotOwner(address nft, uint256 tokenId);
    error NotApproved(address nft);
    error ZeroPrice();
    error PriceTooHigh();
    error BadExpiry(uint256 expiresAt);
    error NotListed(address nft, uint256 tokenId);
    error NotSeller(address nft, uint256 tokenId);
    error ListingExpired(address nft, uint256 tokenId);
    error ListingInvalid(address nft, uint256 tokenId);
    error OwnListing(address nft, uint256 tokenId);
    error PriceAboveMax(uint256 price, uint256 maxPrice);
    error WrongCurrency();
    error BadValue(uint256 expected, uint256 sent);
    error AvaxTransferFailed();
    error InvalidTreasury();
    error FeeTooHigh(uint256 feeBps);

    event Listed(
        address indexed nft,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price,
        bool inAvax,
        uint64 expiresAt
    );
    event Relisted(address indexed nft, uint256 indexed tokenId, uint256 price, bool inAvax, uint64 expiresAt);
    event Cancelled(address indexed nft, uint256 indexed tokenId, address indexed seller);
    event Cleared(address indexed nft, uint256 indexed tokenId);
    event Sold(
        address indexed nft,
        uint256 indexed tokenId,
        address indexed buyer,
        address seller,
        uint256 price,
        uint256 fee,
        bool inAvax
    );
    event ListableSet(address indexed nft, bool allowed);
    event FeeSet(uint256 feeBps);
    event TreasurySet(address treasury, bool isPool);
    event AvaxFeesWithdrawn(address indexed to, uint256 amount);

    constructor(IERC20 usdc_, address treasury_, address owner_) Ownable(owner_) {
        if (treasury_ == address(0)) revert InvalidTreasury();
        usdc = usdc_;
        treasury = treasury_;
    }

    // ---- listing -----------------------------------------------------------

    /// Lists a card you own, priced in BNB (`inAvax`) or USDC. Nothing moves
    /// until it sells. Needs `setApprovalForAll(market, true)` on the collection.
    function list(address nft, uint256 tokenId, uint256 price, bool inAvax, uint64 expiresAt) external {
        if (!listable[nft]) revert NotListable(nft);
        if (IERC721(nft).ownerOf(tokenId) != msg.sender) revert NotOwner(nft, tokenId);
        if (!_approved(nft, msg.sender, tokenId)) revert NotApproved(nft);
        _checkTerms(price, expiresAt);
        bytes32 k = _key(nft, tokenId);
        _listings[k] = Listing(msg.sender, uint96(price), nft, expiresAt, inAvax, tokenId);
        _keys.add(k);
        emit Listed(nft, tokenId, msg.sender, price, inAvax, expiresAt);
    }

    /// Changes price, currency and expiry, including renewing an expired listing.
    function relist(address nft, uint256 tokenId, uint256 price, bool inAvax, uint64 expiresAt) external {
        Listing storage l = _sellerOnly(nft, tokenId);
        _checkTerms(price, expiresAt);
        l.price = uint96(price);
        l.inAvax = inAvax;
        l.expiresAt = expiresAt;
        emit Relisted(nft, tokenId, price, inAvax, expiresAt);
    }

    function cancel(address nft, uint256 tokenId) external {
        _sellerOnly(nft, tokenId);
        _remove(_key(nft, tokenId));
        emit Cancelled(nft, tokenId, msg.sender);
    }

    /// Deletes listings that can no longer be bought. Anyone can call it;
    /// valid listings are left alone.
    function clearInvalid(address[] calldata nfts, uint256[] calldata tokenIds) external {
        for (uint256 i; i < nfts.length; ++i) {
            bytes32 k = _key(nfts[i], tokenIds[i]);
            if (_listings[k].seller == address(0) || isValid(nfts[i], tokenIds[i])) continue;
            _remove(k);
            emit Cleared(nfts[i], tokenIds[i]);
        }
    }

    // ---- buying ------------------------------------------------------------

    /// Buys a listing in its own currency. BNB listings: send exactly the price
    /// as msg.value. USDC listings: approve this market first, send no BNB.
    /// `inAvax` and `maxPrice` guard against the seller changing currency or
    /// price just before. The seller gets the price minus the fee.
    function buy(address nft, uint256 tokenId, bool inAvax, uint256 maxPrice) external payable nonReentrant {
        Listing memory l = _takeListing(nft, tokenId);
        if (l.inAvax != inAvax) revert WrongCurrency();
        if (l.price > maxPrice) revert PriceAboveMax(l.price, maxPrice);
        uint256 fee = uint256(l.price) * feeBps / BPS;

        if (l.inAvax) {
            if (msg.value != l.price) revert BadValue(l.price, msg.value);
            avaxFees += fee;
            (bool ok,) = payable(l.seller).call{value: l.price - fee}("");
            if (!ok) revert AvaxTransferFailed();
        } else {
            if (msg.value != 0) revert BadValue(0, msg.value);
            usdc.safeTransferFrom(msg.sender, l.seller, l.price - fee);
            if (fee > 0) {
                if (treasuryIsPool) {
                    usdc.safeTransferFrom(msg.sender, address(this), fee);
                    usdc.forceApprove(treasury, fee);
                    IRevenuePool(treasury).addRevenue(fee);
                } else {
                    usdc.safeTransferFrom(msg.sender, treasury, fee);
                }
            }
        }
        IERC721(nft).safeTransferFrom(l.seller, msg.sender, tokenId);
        emit Sold(nft, tokenId, msg.sender, l.seller, l.price, fee, l.inAvax);
    }

    // ---- views -------------------------------------------------------------

    function listings(address nft, uint256 tokenId)
        external
        view
        returns (address seller, uint256 price, bool inAvax, uint64 expiresAt)
    {
        Listing storage l = _listings[_key(nft, tokenId)];
        return (l.seller, l.price, l.inAvax, l.expiresAt);
    }

    /// Whether the listing can be bought right now.
    function isValid(address nft, uint256 tokenId) public view returns (bool) {
        Listing storage l = _listings[_key(nft, tokenId)];
        if (l.seller == address(0) || block.timestamp >= l.expiresAt) return false;
        try IERC721(nft).ownerOf(tokenId) returns (address holder) {
            return holder == l.seller && _approved(nft, l.seller, tokenId);
        } catch {
            return false; // burned: redeemed card
        }
    }

    /// Every stored listing, valid or not. Filter with `isValid`.
    function allListings()
        external
        view
        returns (
            address[] memory nfts,
            uint256[] memory tokenIds,
            address[] memory sellers,
            uint256[] memory prices,
            bool[] memory inAvax,
            uint64[] memory expiresAts
        )
    {
        uint256 n = _keys.length();
        nfts = new address[](n);
        tokenIds = new uint256[](n);
        sellers = new address[](n);
        prices = new uint256[](n);
        inAvax = new bool[](n);
        expiresAts = new uint64[](n);
        for (uint256 i; i < n; ++i) {
            Listing storage l = _listings[_keys.at(i)];
            (nfts[i], tokenIds[i], sellers[i], prices[i], inAvax[i], expiresAts[i]) =
            (l.nft, l.tokenId, l.seller, l.price, l.inAvax, l.expiresAt);
        }
    }

    function listingCount() external view returns (uint256) {
        return _keys.length();
    }

    // ---- admin -------------------------------------------------------------

    function setListable(address nft, bool allowed) external onlyOwner {
        listable[nft] = allowed;
        emit ListableSet(nft, allowed);
    }

    function setFee(uint256 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh(feeBps_);
        feeBps = feeBps_;
        emit FeeSet(feeBps_);
    }

    function setTreasury(address newTreasury, bool isPool) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidTreasury();
        treasury = newTreasury;
        treasuryIsPool = isPool;
        emit TreasurySet(newTreasury, isPool);
    }

    /// Sends all collected BNB fees to `to`.
    function withdrawAvaxFees(address payable to) external onlyOwner nonReentrant returns (uint256 amount) {
        if (to == address(0)) revert InvalidTreasury();
        amount = avaxFees;
        avaxFees = 0;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert AvaxTransferFailed();
        emit AvaxFeesWithdrawn(to, amount);
    }

    // ---- internals ---------------------------------------------------------

    /// Checks msg.sender can buy the listing, and removes it before anything moves.
    function _takeListing(address nft, uint256 tokenId) private returns (Listing memory l) {
        bytes32 k = _key(nft, tokenId);
        l = _listings[k];
        if (l.seller == address(0)) revert NotListed(nft, tokenId);
        if (block.timestamp >= l.expiresAt) revert ListingExpired(nft, tokenId);
        if (l.seller == msg.sender) revert OwnListing(nft, tokenId);
        if (!isValid(nft, tokenId)) revert ListingInvalid(nft, tokenId);
        _remove(k);
    }

    function _checkTerms(uint256 price, uint64 expiresAt) private view {
        if (price == 0) revert ZeroPrice();
        if (price > type(uint96).max) revert PriceTooHigh();
        if (expiresAt < block.timestamp + MIN_DURATION || expiresAt > block.timestamp + MAX_DURATION) {
            revert BadExpiry(expiresAt);
        }
    }

    function _sellerOnly(address nft, uint256 tokenId) private view returns (Listing storage l) {
        l = _listings[_key(nft, tokenId)];
        if (l.seller == address(0)) revert NotListed(nft, tokenId);
        if (l.seller != msg.sender) revert NotSeller(nft, tokenId);
    }

    function _approved(address nft, address owner_, uint256 tokenId) private view returns (bool) {
        return
            IERC721(nft).isApprovedForAll(owner_, address(this)) || IERC721(nft).getApproved(tokenId) == address(this);
    }

    function _remove(bytes32 k) private {
        delete _listings[k];
        _keys.remove(k);
    }

    function _key(address nft, uint256 tokenId) private pure returns (bytes32) {
        return keccak256(abi.encode(nft, tokenId));
    }
}
