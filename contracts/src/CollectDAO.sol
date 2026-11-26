// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IPoints {
    function pastPointsOf(address account, uint256 blockNumber) external view returns (uint256);
    function pastTotalPoints(uint256 blockNumber) external view returns (uint256);
}

/// @title Grailio DAO: proposals and votes weighted by Grailio points.
/// @notice Signal governance for the beta. A vote's weight is the points the
/// voter held at the block before the proposal was made, so points earned
/// mid-vote don't count. Results are recorded on chain; nothing executes
/// automatically (points cost about $1 each, so binding spend powers can come
/// once the community is large enough that buying a majority is impractical).
///
/// A proposal passes if, when voting ends, turnout (for + against + abstain)
/// reaches `quorumBps` of all points at the snapshot and `for` beats `against`.
/// The owner (guardian) can cancel spam; proposers can cancel their own.
contract CollectDAO is Ownable2Step {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_TITLE = 120;
    uint256 public constant MAX_BODY = 4_000;

    enum Support {
        Against,
        For,
        Abstain
    }

    enum State {
        Active,
        Passed,
        Defeated,
        Cancelled
    }

    struct Proposal {
        address proposer;
        uint48 snapshot; // block whose points count
        uint64 start;
        uint64 end;
        bool cancelled;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        string title;
        string body;
    }

    IPoints public immutable points;
    uint64 public votingPeriod = 3 days;
    uint16 public quorumBps = 1_000; // 10% of all points
    uint256 public proposalThreshold = 5; // points needed to propose

    Proposal[] private _proposals;
    mapping(uint256 id => mapping(address voter => uint8)) private _votes; // 0 none, else support + 1

    event ProposalCreated(uint256 indexed id, address indexed proposer, string title, uint256 snapshot, uint64 end);
    event VoteCast(uint256 indexed id, address indexed voter, Support support, uint256 weight);
    event ProposalCancelled(uint256 indexed id);
    event ParamsSet(uint64 votingPeriod, uint16 quorumBps, uint256 proposalThreshold);

    error BelowThreshold(uint256 points, uint256 needed);
    error BadText();
    error UnknownProposal();
    error NotActive();
    error AlreadyVoted();
    error NoVotingPower();
    error NotAllowed();
    error BadParams();

    constructor(IPoints points_, address owner_) Ownable(owner_) {
        points = points_;
    }

    function propose(string calldata title, string calldata body) external returns (uint256 id) {
        if (bytes(title).length == 0 || bytes(title).length > MAX_TITLE || bytes(body).length > MAX_BODY) revert BadText();
        uint256 snapshot = block.number - 1;
        uint256 held = points.pastPointsOf(msg.sender, snapshot);
        if (held < proposalThreshold) revert BelowThreshold(held, proposalThreshold);

        id = _proposals.length;
        Proposal storage p = _proposals.push();
        p.proposer = msg.sender;
        p.snapshot = uint48(snapshot);
        p.start = uint64(block.timestamp);
        p.end = uint64(block.timestamp) + votingPeriod;
        p.title = title;
        p.body = body;
        emit ProposalCreated(id, msg.sender, title, snapshot, p.end);
    }

    function vote(uint256 id, Support support) external {
        Proposal storage p = _proposal(id);
        if (p.cancelled || block.timestamp >= p.end) revert NotActive();
        if (_votes[id][msg.sender] != 0) revert AlreadyVoted();
        uint256 weight = points.pastPointsOf(msg.sender, p.snapshot);
        if (weight == 0) revert NoVotingPower();

        _votes[id][msg.sender] = uint8(support) + 1;
        if (support == Support.For) p.forVotes += weight;
        else if (support == Support.Against) p.againstVotes += weight;
        else p.abstainVotes += weight;
        emit VoteCast(id, msg.sender, support, weight);
    }

    function cancel(uint256 id) external {
        Proposal storage p = _proposal(id);
        if (msg.sender != p.proposer && msg.sender != owner()) revert NotAllowed();
        if (p.cancelled || block.timestamp >= p.end) revert NotActive();
        p.cancelled = true;
        emit ProposalCancelled(id);
    }

    // ---- views ----

    function state(uint256 id) public view returns (State) {
        Proposal storage p = _proposal(id);
        if (p.cancelled) return State.Cancelled;
        if (block.timestamp < p.end) return State.Active;
        uint256 turnout = p.forVotes + p.againstVotes + p.abstainVotes;
        uint256 quorum = _quorum(points.pastTotalPoints(p.snapshot));
        return turnout >= quorum && turnout > 0 && p.forVotes > p.againstVotes ? State.Passed : State.Defeated;
    }

    /// Points of all wallets at the proposal's snapshot, and the turnout it needs.
    function quorumOf(uint256 id) external view returns (uint256 totalAtSnapshot, uint256 needed) {
        Proposal storage p = _proposal(id);
        totalAtSnapshot = points.pastTotalPoints(p.snapshot);
        needed = _quorum(totalAtSnapshot);
    }

    function proposal(uint256 id) external view returns (Proposal memory) {
        return _proposal(id);
    }

    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    /// 0 = hasn't voted, 1 = against, 2 = for, 3 = abstain.
    function voteOf(uint256 id, address voter) external view returns (uint8) {
        return _votes[id][voter];
    }

    /// What `voter` can vote with on `id`.
    function votingPower(uint256 id, address voter) external view returns (uint256) {
        return points.pastPointsOf(voter, _proposal(id).snapshot);
    }

    // ---- admin ----

    function setParams(uint64 votingPeriod_, uint16 quorumBps_, uint256 proposalThreshold_) external onlyOwner {
        if (votingPeriod_ < 1 hours || votingPeriod_ > 30 days || quorumBps_ > BPS) revert BadParams();
        votingPeriod = votingPeriod_;
        quorumBps = quorumBps_;
        proposalThreshold = proposalThreshold_;
        emit ParamsSet(votingPeriod_, quorumBps_, proposalThreshold_);
    }

    /// Turnout needed, rounded up so a tiny electorate can never have a zero quorum.
    function _quorum(uint256 total) private view returns (uint256) {
        return Math.mulDiv(total, quorumBps, BPS, Math.Rounding.Ceil);
    }

    function _proposal(uint256 id) private view returns (Proposal storage) {
        if (id >= _proposals.length) revert UnknownProposal();
        return _proposals[id];
    }
}
