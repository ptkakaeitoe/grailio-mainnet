// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title Grailio points: non-transferable activity points used for DAO votes.
/// @notice Not a token. There is no transfer, approve or sell: points can only
/// be awarded by approved contracts (the pack contract gives one per $1 pack)
/// and stay with the wallet that earned them. Balances are checkpointed by
/// block, so a vote counts the points a wallet had when the proposal started.
contract CollectPoints is Ownable2Step {
    using Checkpoints for Checkpoints.Trace208;

    /// Contracts allowed to award points.
    mapping(address account => bool) public awarders;
    mapping(address account => Checkpoints.Trace208) private _points;
    Checkpoints.Trace208 private _total;

    event Awarded(address indexed to, uint256 amount, address indexed by);
    event AwarderSet(address indexed account, bool allowed);

    error NotAwarder(address caller);
    error FutureLookup(uint256 blockNumber, uint256 current);

    constructor(address owner_) Ownable(owner_) {}

    function award(address to, uint256 amount) external {
        if (!awarders[msg.sender]) revert NotAwarder(msg.sender);
        if (amount == 0 || to == address(0)) return;
        uint48 now_ = SafeCast.toUint48(block.number);
        _points[to].push(now_, _points[to].latest() + SafeCast.toUint208(amount));
        _total.push(now_, _total.latest() + SafeCast.toUint208(amount));
        emit Awarded(to, amount, msg.sender);
    }

    function setAwarder(address account, bool allowed) external onlyOwner {
        awarders[account] = allowed;
        emit AwarderSet(account, allowed);
    }

    function pointsOf(address account) external view returns (uint256) {
        return _points[account].latest();
    }

    function totalPoints() external view returns (uint256) {
        return _total.latest();
    }

    /// Points `account` held at the end of block `blockNumber` (must be in the past).
    function pastPointsOf(address account, uint256 blockNumber) external view returns (uint256) {
        if (blockNumber >= block.number) revert FutureLookup(blockNumber, block.number);
        return _points[account].upperLookupRecent(SafeCast.toUint48(blockNumber));
    }

    function pastTotalPoints(uint256 blockNumber) external view returns (uint256) {
        if (blockNumber >= block.number) revert FutureLookup(blockNumber, block.number);
        return _total.upperLookupRecent(SafeCast.toUint48(blockNumber));
    }
}
