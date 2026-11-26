// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAggregatorV3} from "./CollectPacks.sol";

/// Atlas Oracle MultiFeed on BNB Chain (proxy 0xeace519e…44aa). One contract serves every
/// feed by a 4-byte feed ID; `fetchBatch` returns, per ID, the price (18 decimals), the
/// report timestamp, and the time it was written on chain. An unknown or empty ID returns zeros.
interface IAtlasMultiFeed {
    struct Price {
        uint256 value;
        uint256 timestamp; // when Atlas observed / signed the price
        uint256 updatedAt; // when it was pushed on chain (>= timestamp)
    }

    function fetchBatch(bytes4[] calldata feedIds) external view returns (Price[] memory);
    function decimals() external view returns (uint8);
}

/// @title AtlasFeedAdapter: one Atlas MultiFeed feed behind the Chainlink AggregatorV3 interface.
/// @notice Immutable, no owner. `latestRoundData` returns Atlas's answer and the report
/// timestamp as `updatedAt` (the older of Atlas's two timestamps, so freshness is never
/// overstated). With no price (unknown feed, zero value) it returns answer 0 and updatedAt 0,
/// which CollectPacks.priceOf treats as invalid; if the MultiFeed call reverts, so does this,
/// and priceOf's try/catch also returns 0. Either way the card keeps its USDC until `fill`.
/// `roundId`/`answeredInRound` are the report timestamp: Atlas has no rounds.
contract AtlasFeedAdapter is IAggregatorV3 {
    IAtlasMultiFeed public immutable multiFeed;
    bytes4 public immutable feedId;
    uint8 public immutable decimals;
    string public description;

    error NoPrice();

    constructor(IAtlasMultiFeed multiFeed_, uint32 feedId_, string memory description_) {
        multiFeed = multiFeed_;
        feedId = bytes4(feedId_);
        decimals = multiFeed_.decimals();
        description = description_;
        // Catch a mistyped feed ID at deploy: it must have a live price now.
        (, int256 answer,, uint256 updatedAt,) = latestRoundData();
        if (answer <= 0 || updatedAt == 0) revert NoPrice();
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function latestRoundData()
        public
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        bytes4[] memory ids = new bytes4[](1);
        ids[0] = feedId;
        IAtlasMultiFeed.Price[] memory p = multiFeed.fetchBatch(ids);
        if (p.length != 1 || p[0].value == 0 || p[0].timestamp == 0 || p[0].value > uint256(type(int256).max)) {
            return (0, 0, 0, 0, 0);
        }
        updatedAt = p[0].timestamp;
        roundId = uint80(updatedAt);
        return (roundId, int256(p[0].value), updatedAt, updatedAt, roundId);
    }
}
