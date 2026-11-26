// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721, ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function decimals() external view returns (uint8);
}

/// Uniswap v3 SwapRouter02 (no deadline field).
interface ISwapRouter02 {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

/// CollectPoints: non-transferable activity points.
interface ICollectPoints {
    function award(address to, uint256 amount) external;
}

/// Uniswap v2-style router (LFJ v1).
interface IV2Router {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/// @title Grailio packs: $1 USDC mystery packs whose cards hold real BNB Chain tokens.
/// @notice
/// Buy: pay a tier's price in USDC. The pack commits to the next block's hash.
/// Open: that hash rolls a token and a rarity. A card NFT is minted and, in the
/// same transaction, the pool swaps the card's USD value from USDC into the
/// token on a DEX and locks it in the card. Redeem: burn the card, get the tokens.
///
/// Treasury rules (all USDC):
/// - `reserved()` = top payout of every unopened pack + USDC held by unfilled cards.
/// - A sale the pool can't reserve for reverts, so the pool never owes more than it holds.
/// - The owner can only `withdraw` the surplus above `reserved()`.
/// - Tokens locked in cards can never be withdrawn or rescued by the owner.
/// - Paused: no sales; buyers can `refund` unopened packs at the price they paid.
///   Once every pack is refunded or opened, the whole pool is surplus.
///
/// Swap safety: every swap must return at least the Chainlink fair amount minus the
/// asset's `maxSlippageBps`. If it can't (stale feed, pushed pool, router failure),
/// the card is still minted, holding its USD value in USDC, and anyone can `fill` it later.
/// Gifts: `buyGift` pays for packs held for whoever has the gift code. The code holds
/// a private key whose address is stored with the gift; claiming means signing your own
/// address with it, so a copied claim transaction can't be redirected. Gift packs get
/// their reveal block when claimed, so neither side can know the result in advance.
/// Randomness: a block hash chosen after the purchase. If a pack isn't opened within
/// 256 blocks the hash is gone and it opens as the lowest rarity, so waiting never pays.
contract CollectPacks is ERC721Enumerable, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_BATCH = 10;
    uint256 public constant REVEAL_WINDOW = 256;
    /// Guard against a mistyped tier: no single card may hold more than $1,000 (in USDC units).
    uint256 public immutable MAX_BACKING;
    uint16 public constant MAX_SLIPPAGE_BPS = 1_000;

    enum Route {
        None,
        UniswapV3,
        V2
    }

    struct Tier {
        uint128 price; // USDC, in the token's own decimals
        uint16[4] oddsBps; // per rarity, sums to 10,000
        uint128[4] backing; // USDC value per rarity, in the token's own decimals
        bool active;
    }

    struct Asset {
        IERC20 token;
        IAggregatorV3 feed; // TOKEN/USD
        uint8 tokenDecimals;
        uint8 feedDecimals;
        uint32 maxFeedAge; // seconds
        uint16 maxSlippageBps; // vs the Chainlink fair amount
        Route route;
        bool active;
        bytes v3Path; // USDC ... token, Uniswap v3 encoding
        address[] v2Path; // [USDC, ..., token]
    }

    struct Pack {
        address owner;
        uint64 revealBlock;
        uint8 tier;
        bool done; // opened or refunded
        uint128 paid; // USDC paid, refunded if paused
    }

    struct Gift {
        address from;
        address signer; // address of the key in the gift code
        uint8 tier;
        uint8 quantity;
        bool done; // claimed or cancelled
        uint128 paid; // USDC per pack
    }

    struct Card {
        uint8 asset;
        uint8 tier;
        uint8 rarity;
        bool filled; // true: holds `amount` tokens; false: holds `usd` in USDC
        uint128 usd;
        uint256 amount;
    }

    IERC20 public immutable usdc;
    /// USDC's decimals, read once at deploy (6 on most chains, 18 on BNB Chain).
    uint8 public immutable usdcDecimals;
    /// 10 ** usdcDecimals: one whole USDC.
    uint256 private immutable _usdcUnit;
    ISwapRouter02 public immutable v3Router;
    IV2Router public immutable v2Router;

    Tier[] private _tiers;
    Asset[] private _assets;
    mapping(uint256 packId => Pack) public packs;
    mapping(address owner => uint256[]) private _packIds;
    mapping(uint256 cardId => Card) public cards;
    mapping(uint256 giftId => Gift) public gifts;
    /// Which gift a code's key belongs to, so a code alone finds its gift.
    mapping(address signer => uint256 giftId) public giftIdOf;
    /// Tokens locked in cards, per token. Never withdrawable by the owner.
    mapping(address token => uint256) public lockedOf;
    /// Cards each wallet has redeemed (burned), for its profile history.
    mapping(address owner => uint256[]) private _redeemed;
    /// Cards each wallet holds, per asset (gates holder chat rooms).
    mapping(address owner => mapping(uint256 assetId => uint256)) public heldOf;

    uint256 public nextPackId = 1;
    uint256 public nextCardId = 1;
    uint256 public nextGiftId = 1;
    /// Sum of the top payout of every unopened pack.
    uint256 public packReserve;
    /// USDC held by cards whose swap hasn't happened yet.
    uint256 public pendingUsdc;
    string private _base;
    /// Optional: awards DAO points to buyers. Unset = no points.
    ICollectPoints public points;
    uint256 public pointsPerPack = 1;

    /// Profit not yet shared out: each opened pack's price minus its card's value,
    /// plus revenue added by the market. Goes negative after big wins; losses are
    /// made back before anything is shared again.
    int256 public pendingRevenue;
    /// Where `distribute` sends revenue shares. Unset = that share stays with the owner.
    address public stakingSink;
    address public daoSink;
    uint16 public stakingBps;
    uint16 public daoBps;
    /// Surplus kept in the pool before revenue is shared (a buffer for big wins).
    uint256 public minBankroll;

    event TierAdded(uint256 indexed tierId, uint128 price, uint16[4] oddsBps, uint128[4] backing);
    event TierActive(uint256 indexed tierId, bool active);
    event AssetAdded(uint256 indexed assetId, address token, address feed);
    event AssetUpdated(uint256 indexed assetId);
    event PacksBought(
        address indexed buyer, uint256 indexed tierId, uint256 firstPackId, uint256 quantity, uint256 paid
    );
    event PackOpened(
        uint256 indexed packId,
        uint256 indexed cardId,
        address indexed owner,
        uint8 asset,
        uint8 rarity,
        uint128 usd,
        bool expired
    );
    event CardFilled(uint256 indexed cardId, uint256 amount);
    event CardRedeemed(uint256 indexed cardId, address indexed to, bool filled, uint256 amount);
    event GiftBought(
        uint256 indexed giftId, address indexed from, uint256 indexed tierId, uint256 quantity, address signer
    );
    event GiftClaimed(uint256 indexed giftId, address indexed to, uint256 firstPackId);
    event GiftCancelled(uint256 indexed giftId, uint256 firstPackId);
    event PackRefunded(uint256 indexed packId, address indexed to, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event Rescued(address indexed token, address indexed to, uint256 amount);
    event PointsSet(address points, uint256 perPack);
    event RevenueAdded(address indexed from, uint256 amount);
    event Distributed(uint256 amount, uint256 toStaking, uint256 toDao);
    event SharesSet(address staking, uint16 stakingBps, address dao, uint16 daoBps);
    event MinBankrollSet(uint256 amount);

    error BadTier();
    error BadAsset();
    error BadQuantity();
    error PoolTooSmall(uint256 balance, uint256 needed);
    error NotYourPack();
    error PackDone();
    error RevealNotReady();
    error NoActiveAssets();
    error NotYourCard();
    error AlreadyFilled();
    error SwapUnavailable();
    error ExceedsSurplus(uint256 requested, uint256 surplus);
    error ProtectedToken();
    error ZeroAddress();
    error GiftDone();
    error BadGiftCode();
    error NotYourGift();
    error GiftCodeUsed();
    error BadShares();

    constructor(IERC20 usdc_, ISwapRouter02 v3Router_, IV2Router v2Router_, address owner_)
        ERC721("Collect Card", "COLLECT")
        Ownable(owner_)
    {
        if (address(usdc_) == address(0)) revert ZeroAddress();
        uint8 dec = IERC20Metadata(address(usdc_)).decimals();
        if (dec > 30) revert BadAsset();
        usdc = usdc_;
        usdcDecimals = dec;
        _usdcUnit = 10 ** uint256(dec);
        MAX_BACKING = 1_000 * 10 ** uint256(dec);
        v3Router = v3Router_;
        v2Router = v2Router_;
    }

    // ---------------------------------------------------------------- players

    /// Buy `quantity` packs of `tierId`, paying in USDC (approve first).
    function buy(uint256 tierId, uint256 quantity) external nonReentrant whenNotPaused returns (uint256 firstPackId) {
        uint128 price = _pay(tierId, quantity);
        firstPackId = _issue(msg.sender, tierId, quantity, price);
        emit PacksBought(msg.sender, tierId, firstPackId, quantity, uint256(price) * quantity);
    }

    /// Buy `quantity` packs as a gift. `signer` is the address of the gift code's key;
    /// whoever holds the code can claim them. You get the DAO points for buying.
    function buyGift(uint256 tierId, uint256 quantity, address signer)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 giftId)
    {
        if (signer == address(0)) revert ZeroAddress();
        if (giftIdOf[signer] != 0) revert GiftCodeUsed();
        uint128 price = _pay(tierId, quantity);
        giftId = nextGiftId++;
        giftIdOf[signer] = giftId;
        gifts[giftId] = Gift({
            from: msg.sender, signer: signer, tier: uint8(tierId), quantity: uint8(quantity), done: false, paid: price
        });
        emit GiftBought(giftId, msg.sender, tierId, quantity, signer);
    }

    /// Claim a gift with `signature` = the gift code's key signing `giftMessage(giftId, you)`.
    /// The packs are yours, ready to open from the next block. Works while paused, so
    /// a claimed pack can always be refunded or opened.
    function claimGift(uint256 giftId, bytes calldata signature) external nonReentrant returns (uint256 firstPackId) {
        Gift storage g = gifts[giftId];
        if (g.from == address(0)) revert BadGiftCode();
        if (g.done) revert GiftDone();
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(giftMessage(giftId, msg.sender));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || recovered != g.signer) revert BadGiftCode();
        g.done = true;
        firstPackId = _issue(msg.sender, g.tier, g.quantity, g.paid);
        emit GiftClaimed(giftId, msg.sender, firstPackId);
    }

    /// Take back a gift nobody has claimed: the packs come to you instead.
    function cancelGift(uint256 giftId) external nonReentrant returns (uint256 firstPackId) {
        Gift storage g = gifts[giftId];
        if (g.from != msg.sender) revert NotYourGift();
        if (g.done) revert GiftDone();
        g.done = true;
        firstPackId = _issue(msg.sender, g.tier, g.quantity, g.paid);
        emit GiftCancelled(giftId, firstPackId);
    }

    /// What the gift code's key signs to claim `giftId` for `to` (sign it as a personal message).
    function giftMessage(uint256 giftId, address to) public view returns (bytes32) {
        return keccak256(abi.encode("CollectGift", block.chainid, address(this), giftId, to));
    }

    /// Open one of your packs from the block after it was bought.
    function open(uint256 packId) public nonReentrant returns (uint256 cardId) {
        Pack storage p = packs[packId];
        if (p.owner != msg.sender) revert NotYourPack();
        if (p.done) revert PackDone();
        if (block.number <= p.revealBlock) revert RevealNotReady();
        p.done = true;
        packReserve -= maxPayout(p.tier);

        (uint8 assetId, uint8 rarity, bool expired) = _roll(packId, p);
        Tier storage t = _tiers[p.tier];
        uint128 usd = t.backing[rarity];

        cardId = nextCardId++;
        cards[cardId] = Card({asset: assetId, tier: p.tier, rarity: rarity, filled: false, usd: usd, amount: 0});
        pendingUsdc += usd;
        pendingRevenue += int256(uint256(p.paid)) - int256(uint256(usd));
        _mint(msg.sender, cardId);
        emit PackOpened(packId, cardId, msg.sender, assetId, rarity, usd, expired);

        _tryFill(cardId);
    }

    function openMany(uint256[] calldata packIds) external returns (uint256[] memory cardIds) {
        if (packIds.length == 0 || packIds.length > MAX_BATCH) revert BadQuantity();
        cardIds = new uint256[](packIds.length);
        for (uint256 i; i < packIds.length; ++i) {
            cardIds[i] = open(packIds[i]);
        }
    }

    /// Swap an unfilled card's USDC into its token. Anyone may call.
    function fill(uint256 cardId) external nonReentrant {
        _requireOwned(cardId);
        if (cards[cardId].filled) revert AlreadyFilled();
        if (!_tryFill(cardId)) revert SwapUnavailable();
    }

    /// Burn your card and receive what it holds: its tokens, or its USDC if never filled.
    function redeem(uint256 cardId) external nonReentrant {
        if (ownerOf(cardId) != msg.sender) revert NotYourCard();
        Card memory c = cards[cardId];
        _burn(cardId);
        // The card's record stays, so profiles can still show it as redeemed (not tradable: it's burned).
        _redeemed[msg.sender].push(cardId);
        if (c.filled) {
            IERC20 token = _assets[c.asset].token;
            lockedOf[address(token)] -= c.amount;
            token.safeTransfer(msg.sender, c.amount);
            emit CardRedeemed(cardId, msg.sender, true, c.amount);
        } else {
            pendingUsdc -= c.usd;
            usdc.safeTransfer(msg.sender, c.usd);
            emit CardRedeemed(cardId, msg.sender, false, c.usd);
        }
    }

    /// While paused, get your money back for an unopened pack.
    function refund(uint256 packId) external nonReentrant whenPaused {
        Pack storage p = packs[packId];
        if (p.owner != msg.sender) revert NotYourPack();
        if (p.done) revert PackDone();
        p.done = true;
        packReserve -= maxPayout(p.tier);
        usdc.safeTransfer(msg.sender, p.paid);
        emit PackRefunded(packId, msg.sender, p.paid);
    }

    // ---------------------------------------------------------------- treasury

    /// USDC owed to players: top payouts of unopened packs plus unfilled cards.
    function reserved() public view returns (uint256) {
        return packReserve + pendingUsdc;
    }

    /// USDC the owner may withdraw.
    function surplus() public view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        uint256 owed = reserved();
        return balance > owed ? balance - owed : 0;
    }

    /// Revenue `distribute` can share now: pending profit, up to the surplus above `minBankroll`.
    function distributable() public view returns (uint256) {
        if (pendingRevenue <= 0) return 0;
        uint256 s = surplus();
        uint256 free = s > minBankroll ? s - minBankroll : 0;
        uint256 pending = uint256(pendingRevenue);
        return pending < free ? pending : free;
    }

    /// Surplus the owner may withdraw: everything not yet shared out as revenue.
    function ownerFree() public view returns (uint256) {
        uint256 s = surplus();
        uint256 pending = pendingRevenue > 0 ? uint256(pendingRevenue) : 0;
        return s > pending ? s - pending : 0;
    }

    /// Share pending revenue: `stakingBps` to staking, `daoBps` to the DAO, the rest
    /// becomes the owner's surplus. Anyone may call.
    function distribute() external nonReentrant returns (uint256 amount) {
        amount = _distribute();
    }

    /// Add USDC revenue (the market's fees), shared by the next `distribute`.
    function addRevenue(uint256 amount) external nonReentrant {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        pendingRevenue += int256(amount);
        emit RevenueAdded(msg.sender, amount);
    }

    /// Send the owner's surplus USDC to `to`, sharing pending revenue first.
    /// Can never touch what players are owed or what staking and the DAO are due.
    function withdraw(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        _distribute();
        uint256 free = ownerFree();
        if (amount > free) revert ExceedsSurplus(amount, free);
        usdc.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    /// Send all of the owner's surplus USDC to `to`, sharing pending revenue first.
    function withdrawAll(address to) external onlyOwner nonReentrant returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        _distribute();
        amount = ownerFree();
        usdc.safeTransfer(to, amount);
        emit Withdrawn(to, amount);
    }

    /// Recover tokens sent here by mistake. Never USDC, never tokens locked in cards.
    function rescue(IERC20 token, address to) external onlyOwner nonReentrant returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        if (address(token) == address(usdc)) revert ProtectedToken();
        uint256 balance = token.balanceOf(address(this));
        uint256 locked = lockedOf[address(token)];
        amount = balance > locked ? balance - locked : 0;
        token.safeTransfer(to, amount);
        emit Rescued(address(token), to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------- config

    /// Tiers are immutable once added (so reserves stay exact); retire one with setTierActive.
    function addTier(uint128 price, uint16[4] calldata oddsBps, uint128[4] calldata backing)
        external
        onlyOwner
        returns (uint256 tierId)
    {
        if (price == 0) revert BadTier();
        uint256 sum;
        for (uint256 i; i < 4; ++i) {
            sum += oddsBps[i];
            if (backing[i] == 0 || backing[i] > MAX_BACKING) revert BadTier();
        }
        if (sum != BPS) revert BadTier();
        if (_tiers.length >= type(uint8).max) revert BadTier();
        tierId = _tiers.length;
        _tiers.push(Tier({price: price, oddsBps: oddsBps, backing: backing, active: true}));
        emit TierAdded(tierId, price, oddsBps, backing);
    }

    function setTierActive(uint256 tierId, bool active) external onlyOwner {
        _tier(tierId).active = active;
        emit TierActive(tierId, active);
    }

    /// Add a token cards can hold. Its token can never change afterwards (locked balances depend on it).
    function addAsset(
        IERC20Metadata token,
        IAggregatorV3 feed,
        uint32 maxFeedAge,
        uint16 maxSlippageBps,
        Route route,
        bytes calldata v3Path,
        address[] calldata v2Path
    ) external onlyOwner returns (uint256 assetId) {
        if (address(token) == address(0) || address(token) == address(usdc)) revert BadAsset();
        if (_assets.length >= type(uint8).max) revert BadAsset();
        assetId = _assets.length;
        Asset storage a = _assets.push();
        a.token = IERC20(address(token));
        a.tokenDecimals = token.decimals();
        a.active = true;
        _setAsset(a, feed, maxFeedAge, maxSlippageBps, route, v3Path, v2Path);
        emit AssetAdded(assetId, address(token), address(feed));
    }

    /// Update an asset's price feed, swap route or tolerance.
    function setAsset(
        uint256 assetId,
        IAggregatorV3 feed,
        uint32 maxFeedAge,
        uint16 maxSlippageBps,
        Route route,
        bytes calldata v3Path,
        address[] calldata v2Path
    ) external onlyOwner {
        _setAsset(_asset(assetId), feed, maxFeedAge, maxSlippageBps, route, v3Path, v2Path);
        emit AssetUpdated(assetId);
    }

    function setAssetActive(uint256 assetId, bool active) external onlyOwner {
        _asset(assetId).active = active;
        emit AssetUpdated(assetId);
    }

    function setBaseURI(string calldata base) external onlyOwner {
        _base = base;
    }

    /// Connect (or disconnect, with address(0)) the points contract, and set points per pack.
    function setPoints(ICollectPoints points_, uint256 perPack) external onlyOwner {
        points = points_;
        pointsPerPack = perPack;
        emit PointsSet(address(points_), perPack);
    }

    /// Set where revenue goes. Pending revenue is shared on the old terms first, so a
    /// change only affects revenue earned after it. A share needs a destination.
    function setShares(address staking_, uint16 stakingBps_, address dao_, uint16 daoBps_)
        external
        onlyOwner
        nonReentrant
    {
        if (uint256(stakingBps_) + daoBps_ > BPS) revert BadShares();
        if ((staking_ == address(0) && stakingBps_ != 0) || (dao_ == address(0) && daoBps_ != 0)) revert BadShares();
        _distribute();
        stakingSink = staking_;
        stakingBps = stakingBps_;
        daoSink = dao_;
        daoBps = daoBps_;
        emit SharesSet(staking_, stakingBps_, dao_, daoBps_);
    }

    function setMinBankroll(uint256 amount) external onlyOwner {
        minBankroll = amount;
        emit MinBankrollSet(amount);
    }

    // ---------------------------------------------------------------- views

    function maxPayout(uint256 tierId) public view returns (uint256 top) {
        uint128[4] storage backing = _tier(tierId).backing;
        for (uint256 i; i < 4; ++i) {
            if (backing[i] > top) top = backing[i];
        }
    }

    /// Average USDC value of a card from this tier.
    function expectedBacking(uint256 tierId) external view returns (uint256 sum) {
        Tier storage t = _tier(tierId);
        for (uint256 i; i < 4; ++i) {
            sum += uint256(t.oddsBps[i]) * t.backing[i];
        }
        sum /= BPS;
    }

    /// How many more packs of `tierId` the pool can sell right now.
    function capacity(uint256 tierId) external view returns (uint256) {
        Tier storage t = _tier(tierId);
        uint256 top = maxPayout(tierId);
        if (top <= t.price) return type(uint256).max;
        // Each sale adds `price` and reserves `top`.
        uint256 balance = usdc.balanceOf(address(this));
        uint256 owed = reserved();
        if (balance <= owed) return 0;
        return (balance - owed) / (top - t.price);
    }

    function tier(uint256 tierId) external view returns (Tier memory) {
        return _tier(tierId);
    }

    function tierCount() external view returns (uint256) {
        return _tiers.length;
    }

    function asset(uint256 assetId) external view returns (Asset memory) {
        return _asset(assetId);
    }

    function assetCount() external view returns (uint256) {
        return _assets.length;
    }

    /// Cards `owner_` redeemed. Their `cards` record still says what they held.
    function redeemedOf(address owner_) external view returns (uint256[] memory) {
        return _redeemed[owner_];
    }

    function packIdsOf(address owner_) external view returns (uint256[] memory) {
        return _packIds[owner_];
    }

    /// 0 = none, 1 = waiting for the reveal block, 2 = ready, 3 = expired (opens lowest), 4 = done.
    function packState(uint256 packId) external view returns (uint8) {
        Pack storage p = packs[packId];
        if (p.owner == address(0)) return 0;
        if (p.done) return 4;
        if (block.number <= p.revealBlock) return 1;
        return block.number - p.revealBlock > REVEAL_WINDOW ? 3 : 2;
    }

    /// Chainlink price for an asset, or 0 if stale or invalid.
    function priceOf(uint256 assetId) public view returns (uint256) {
        Asset storage a = _asset(assetId);
        try a.feed.latestRoundData() returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80) {
            if (answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp) return 0;
            if (block.timestamp - updatedAt > a.maxFeedAge) return 0;
            return uint256(answer);
        } catch {
            return 0;
        }
    }

    /// Tokens worth `usd` (USDC units, `usdcDecimals`) at the Chainlink price, or 0 if no valid price.
    function fairAmount(uint256 assetId, uint256 usd) public view returns (uint256) {
        uint256 price = priceOf(assetId);
        if (price == 0) return 0;
        Asset storage a = _assets[assetId];
        // tokens = (usd / 10^usdcDec) / (price / 10^feedDec) * 10^tokenDec
        return Math.mulDiv(usd, 10 ** (uint256(a.tokenDecimals) + a.feedDecimals), price * _usdcUnit);
    }

    function supportsInterface(bytes4 id) public view override returns (bool) {
        return super.supportsInterface(id);
    }

    // ---------------------------------------------------------------- internals

    function _distribute() private returns (uint256 amount) {
        amount = distributable();
        if (amount == 0) return 0;
        pendingRevenue -= int256(amount);
        uint256 toStaking = amount * stakingBps / BPS;
        uint256 toDao = amount * daoBps / BPS;
        if (toStaking > 0) usdc.safeTransfer(stakingSink, toStaking);
        if (toDao > 0) usdc.safeTransfer(daoSink, toDao);
        emit Distributed(amount, toStaking, toDao);
    }

    /// Takes payment for `quantity` packs of `tierId`, reserves their top payout and
    /// awards the buyer's points. Returns the price per pack.
    function _pay(uint256 tierId, uint256 quantity) private returns (uint128 price) {
        if (quantity == 0 || quantity > MAX_BATCH) revert BadQuantity();
        Tier storage t = _tier(tierId);
        if (!t.active) revert BadTier();
        price = t.price;

        usdc.safeTransferFrom(msg.sender, address(this), uint256(price) * quantity);
        packReserve += maxPayout(tierId) * quantity;
        uint256 balance = usdc.balanceOf(address(this));
        if (balance < reserved()) revert PoolTooSmall(balance, reserved());
        if (address(points) != address(0)) points.award(msg.sender, quantity * pointsPerPack);
    }

    /// Creates `quantity` packs for `owner_`, revealing from the next block. Their
    /// top payout must already be in `packReserve`.
    function _issue(address owner_, uint256 tierId, uint256 quantity, uint128 paid)
        private
        returns (uint256 firstPackId)
    {
        firstPackId = nextPackId;
        uint64 revealBlock = uint64(block.number + 1);
        for (uint256 i; i < quantity; ++i) {
            uint256 id = nextPackId++;
            packs[id] = Pack({owner: owner_, revealBlock: revealBlock, tier: uint8(tierId), done: false, paid: paid});
            _packIds[owner_].push(id);
        }
    }

    function _roll(uint256 packId, Pack storage p) private view returns (uint8 asset_, uint8 rarity, bool expired) {
        uint256 active;
        for (uint256 i; i < _assets.length; ++i) {
            if (_assets[i].active) ++active;
        }
        if (active == 0) revert NoActiveAssets();

        bytes32 hash = blockhash(p.revealBlock);
        uint256 seed;
        if (hash == bytes32(0)) {
            // Too late: the lowest-value rarity, and a token picked from the pack id.
            expired = true;
            seed = uint256(keccak256(abi.encode(packId)));
            rarity = _lowestRarity(_tiers[p.tier].backing);
        } else {
            seed = uint256(keccak256(abi.encode(hash, packId, address(this))));
            rarity = _rarity(_tiers[p.tier].oddsBps, (seed >> 128) % BPS);
        }

        uint256 pick = (seed & type(uint128).max) % active;
        for (uint256 i; i < _assets.length; ++i) {
            if (!_assets[i].active) continue;
            if (pick == 0) return (uint8(i), rarity, expired);
            --pick;
        }
    }

    function _rarity(uint16[4] storage odds, uint256 roll) private view returns (uint8) {
        uint256 cumulative;
        for (uint8 r; r < 4; ++r) {
            cumulative += odds[r];
            if (roll < cumulative) return r;
        }
        return 3;
    }

    function _lowestRarity(uint128[4] storage backing) private view returns (uint8 lowest) {
        for (uint8 r = 1; r < 4; ++r) {
            if (backing[r] < backing[lowest]) lowest = r;
        }
    }

    /// Swap a card's USDC into its token if the price is fair; leaves it unfilled otherwise.
    function _tryFill(uint256 cardId) private returns (bool) {
        Card storage c = cards[cardId];
        Asset storage a = _assets[c.asset];
        uint256 fair = fairAmount(c.asset, c.usd);
        if (fair == 0 || a.route == Route.None) return false;
        uint256 minOut = fair * (BPS - a.maxSlippageBps) / BPS;
        if (minOut == 0) return false;

        address router = a.route == Route.UniswapV3 ? address(v3Router) : address(v2Router);
        if (router == address(0)) return false;
        bytes memory data = a.route == Route.UniswapV3
            ? abi.encodeCall(
                ISwapRouter02.exactInput,
                (ISwapRouter02.ExactInputParams({
                        path: a.v3Path, recipient: address(this), amountIn: c.usd, amountOutMinimum: minOut
                    }))
            )
            : abi.encodeCall(
                IV2Router.swapExactTokensForTokens, (c.usd, minOut, a.v2Path, address(this), block.timestamp)
            );

        uint256 usdcBefore = usdc.balanceOf(address(this));
        uint256 tokenBefore = a.token.balanceOf(address(this));
        usdc.forceApprove(router, c.usd);
        (bool ok,) = router.call(data);
        usdc.forceApprove(router, 0);
        if (!ok) return false;

        uint256 spent = usdcBefore - usdc.balanceOf(address(this));
        uint256 out = a.token.balanceOf(address(this)) - tokenBefore;
        // A router that over-spends or under-delivers is treated as a failure.
        if (spent > c.usd || out < minOut) revert SwapUnavailable();

        pendingUsdc -= c.usd;
        c.filled = true;
        c.amount = out;
        lockedOf[address(a.token)] += out;
        emit CardFilled(cardId, out);
        return true;
    }

    function _setAsset(
        Asset storage a,
        IAggregatorV3 feed,
        uint32 maxFeedAge,
        uint16 maxSlippageBps,
        Route route,
        bytes calldata v3Path,
        address[] calldata v2Path
    ) private {
        if (address(feed) == address(0) || maxFeedAge == 0 || maxSlippageBps > MAX_SLIPPAGE_BPS) {
            revert BadAsset();
        }
        if (route == Route.UniswapV3) {
            // path = token(20) [fee(3) token(20)]+ ; must start at USDC and end at the asset.
            if (v3Path.length < 43 || (v3Path.length - 20) % 23 != 0) revert BadAsset();
            if (address(bytes20(v3Path[:20])) != address(usdc)) revert BadAsset();
            if (address(bytes20(v3Path[v3Path.length - 20:])) != address(a.token)) revert BadAsset();
        } else if (route == Route.V2) {
            if (v2Path.length < 2 || v2Path[0] != address(usdc) || v2Path[v2Path.length - 1] != address(a.token)) {
                revert BadAsset();
            }
        }
        a.feed = feed;
        a.feedDecimals = feed.decimals();
        a.maxFeedAge = maxFeedAge;
        a.maxSlippageBps = maxSlippageBps;
        a.route = route;
        a.v3Path = v3Path;
        a.v2Path = v2Path;
    }

    function _tier(uint256 tierId) private view returns (Tier storage) {
        if (tierId >= _tiers.length) revert BadTier();
        return _tiers[tierId];
    }

    function _asset(uint256 assetId) private view returns (Asset storage) {
        if (assetId >= _assets.length) revert BadAsset();
        return _assets[assetId];
    }

    /// Keeps `heldOf` in step with every mint, transfer and burn.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        uint256 assetId = cards[tokenId].asset;
        if (from != address(0)) --heldOf[from][assetId];
        if (to != address(0)) ++heldOf[to][assetId];
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }
}
