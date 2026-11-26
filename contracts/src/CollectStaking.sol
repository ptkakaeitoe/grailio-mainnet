// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// The parts of CollectPacks staking reads.
interface ICollectCards is IERC721 {
    function cards(uint256 cardId)
        external
        view
        returns (uint8 asset, uint8 tier, uint8 rarity, bool filled, uint128 usd, uint256 amount);
    function heldOf(address owner, uint256 assetId) external view returns (uint256);
}

/// @title Grailio staking: stake cards, earn a share of Grailio's USDC revenue.
/// @notice
/// Rewards are real revenue only: CollectPacks.distribute() sends the staking
/// share here as USDC. Nothing is minted and there is no fixed rate.
///
/// Payout: every USDC that arrives joins one pool, and the pool pays out with a
/// 7-day half-life: whatever is in it, half is paid out over the next 7 days,
/// about 95% within 30 days. New revenue just tops the pool up. While nothing is
/// staked the pool doesn't shrink; it waits for stakers.
///
/// Shares: each staked card earns by rarity weight (Common 1, Rare 2, Epic 4,
/// Legendary 10) out of the total staked weight, second by second.
///
/// Custody: a staked card sits in this contract, so it can't be sold or
/// redeemed until unstaked; its tokens stay inside it. Unstaking returns it and
/// pays its rewards. There is no owner: nobody can take the pool or a card.
///
/// `heldOf` counts cards in a wallet plus cards it has staked, so holder chat
/// rooms gated on this contract keep working for stakers. `stakes` matches what
/// CollectProfiles reads, so staked cards still work as profile pictures.
contract CollectStaking is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    uint256 public constant HALF_LIFE = 7 days;
    /// Reward accounting precision.
    uint256 private constant ACC = 1e24;
    uint256 private constant WAD = 1e18;
    uint256 private constant LN2_WAD = 693_147_180_559_945_309;

    ICollectCards public immutable cards;
    IERC20 public immutable usdc;

    struct Stake {
        address owner;
        uint64 since;
    }

    mapping(uint256 cardId => Stake) public stakes;
    mapping(uint256 cardId => uint256) private _debt; // accPerWeight when last paid
    mapping(uint256 cardId => uint8) private _weight;
    mapping(address owner => EnumerableSet.UintSet) private _staked;
    mapping(address owner => mapping(uint256 assetId => uint256)) public stakedHeldOf;

    /// Sum of the weights of every staked card.
    uint256 public totalWeight;
    /// USDC paid out per unit of weight since launch, scaled by 1e24.
    uint256 public accPerWeight;
    /// USDC still to be paid out (decaying).
    uint256 public pool;
    /// USDC this contract accounts for: the pool plus payouts not yet claimed.
    uint256 public tracked;
    uint64 public lastUpdate;

    event Staked(address indexed owner, uint256 indexed cardId, uint256 weight);
    event Unstaked(address indexed owner, uint256 indexed cardId);
    event Claimed(address indexed owner, uint256 amount);
    event Funded(uint256 amount);

    error NotYourCard(uint256 cardId);
    error NoCards();

    constructor(ICollectCards cards_, IERC20 usdc_) {
        cards = cards_;
        usdc = usdc_;
        lastUpdate = uint64(block.timestamp);
    }

    // ---------------------------------------------------------------- stakers

    /// Stake your cards (approve this contract for your cards first).
    function stake(uint256[] calldata cardIds) external nonReentrant {
        if (cardIds.length == 0) revert NoCards();
        _update();
        for (uint256 i; i < cardIds.length; ++i) {
            uint256 id = cardIds[i];
            if (cards.ownerOf(id) != msg.sender) revert NotYourCard(id);
            (uint8 asset,, uint8 rarity,,,) = cards.cards(id);
            uint8 w = weightOf(rarity);
            cards.transferFrom(msg.sender, address(this), id);
            stakes[id] = Stake({owner: msg.sender, since: uint64(block.timestamp)});
            _debt[id] = accPerWeight;
            _weight[id] = w;
            totalWeight += w;
            _staked[msg.sender].add(id);
            ++stakedHeldOf[msg.sender][asset];
            emit Staked(msg.sender, id, w);
        }
    }

    /// Unstake your cards: they come back to you with their rewards.
    function unstake(uint256[] calldata cardIds) external nonReentrant {
        if (cardIds.length == 0) revert NoCards();
        _update();
        uint256 paid;
        for (uint256 i; i < cardIds.length; ++i) {
            uint256 id = cardIds[i];
            paid += _collect(id);
            (uint8 asset,,,,,) = cards.cards(id);
            totalWeight -= _weight[id];
            delete stakes[id];
            delete _debt[id];
            delete _weight[id];
            _staked[msg.sender].remove(id);
            --stakedHeldOf[msg.sender][asset];
            cards.transferFrom(address(this), msg.sender, id);
            emit Unstaked(msg.sender, id);
        }
        _pay(paid);
    }

    /// Claim the rewards of your staked cards; they stay staked.
    function claim(uint256[] calldata cardIds) external nonReentrant {
        if (cardIds.length == 0) revert NoCards();
        _update();
        uint256 paid;
        for (uint256 i; i < cardIds.length; ++i) {
            paid += _collect(cardIds[i]);
        }
        _pay(paid);
    }

    /// Take in USDC that arrived (e.g. from CollectPacks.distribute) and pay out
    /// what has decayed so far. Anyone may call; every stake, unstake and claim does too.
    function sync() external nonReentrant {
        _update();
    }

    // ---------------------------------------------------------------- views

    /// Rarity weight: Common 1, Rare 2, Epic 4, Legendary 10.
    function weightOf(uint8 rarity) public pure returns (uint8) {
        return rarity == 0 ? 1 : rarity == 1 ? 2 : rarity == 2 ? 4 : 10;
    }

    /// USDC a staked card has earned and not yet claimed.
    function pending(uint256 cardId) external view returns (uint256) {
        if (stakes[cardId].owner == address(0)) return 0;
        (, uint256 acc,) = _preview();
        return _weight[cardId] * (acc - _debt[cardId]) / ACC;
    }

    /// The pool as of now, after decay and new revenue.
    function poolNow() external view returns (uint256 pool_) {
        (pool_,,) = _preview();
    }

    /// Roughly what the pool pays out over the next 24 hours, to everyone staked.
    function payoutPerDay() external view returns (uint256) {
        (uint256 pool_,,) = _preview();
        return pool_ - pool_ * keptAfter(1 days) / WAD;
    }

    /// Cards `owner` has staked.
    function stakedBy(address owner) external view returns (uint256[] memory) {
        return _staked[owner].values();
    }

    /// Cards of `assetId` that `owner` holds or has staked (holder chat rooms).
    function heldOf(address owner, uint256 assetId) external view returns (uint256) {
        return cards.heldOf(owner, assetId) + stakedHeldOf[owner][assetId];
    }

    /// Share of the pool still left after `dt` seconds: 2^(-dt / HALF_LIFE), 1e18 = all.
    function keptAfter(uint256 dt) public pure returns (uint256) {
        uint256 halvings = dt / HALF_LIFE;
        if (halvings >= 128) return 0;
        // e^-y for the remainder, y = (fraction of a half-life) * ln 2, in [0, 0.694).
        uint256 y = (dt % HALF_LIFE) * LN2_WAD / HALF_LIFE;
        uint256 term = WAD;
        uint256 sum = WAD;
        for (uint256 i = 1; i < 24; ++i) {
            term = term * y / (i * WAD);
            if (term == 0) break;
            if (i % 2 == 1) sum -= term;
            else sum += term;
        }
        return sum >> halvings;
    }

    // ---------------------------------------------------------------- internals

    /// Pool and accumulator as `_update` would leave them now.
    function _preview() private view returns (uint256 pool_, uint256 acc, uint256 incoming) {
        pool_ = pool;
        acc = accPerWeight;
        if (totalWeight > 0) {
            uint256 released = pool_ - pool_ * keptAfter(block.timestamp - lastUpdate) / WAD;
            pool_ -= released;
            acc += released * ACC / totalWeight;
        }
        uint256 balance = usdc.balanceOf(address(this));
        incoming = balance > tracked ? balance - tracked : 0;
        pool_ += incoming;
    }

    /// Pays out what decayed since the last update, then adds new USDC to the pool.
    /// New revenue starts decaying from now, so it can't be paid out retroactively.
    function _update() private {
        (uint256 pool_, uint256 acc, uint256 incoming) = _preview();
        pool = pool_;
        accPerWeight = acc;
        tracked += incoming;
        lastUpdate = uint64(block.timestamp);
        if (incoming > 0) emit Funded(incoming);
    }

    /// Settles one of the caller's cards: returns its earnings and resets its debt.
    function _collect(uint256 cardId) private returns (uint256 amount) {
        if (stakes[cardId].owner != msg.sender) revert NotYourCard(cardId);
        amount = _weight[cardId] * (accPerWeight - _debt[cardId]) / ACC;
        _debt[cardId] = accPerWeight;
    }

    function _pay(uint256 amount) private {
        if (amount == 0) return;
        tracked -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }
}
