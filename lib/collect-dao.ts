import { zeroAddress, type Address } from "viem";

import deployment from "@/deployments/56.json";

/**
 * CollectPoints (non-transferable, 1 per $1 pack) and CollectDAO (signal votes
 * weighted by points at the proposal's snapshot). Written into
 * deployments/56.json by contracts/script/DeployCollectPacks.s.sol.
 */
const d = deployment as { collectPoints?: string; collectDao?: string };
export const pointsAddress = (d.collectPoints ?? zeroAddress) as Address;
export const daoAddress = (d.collectDao ?? zeroAddress) as Address;
/** The DAO is hidden for now (nav, /dao, /info). The contracts stay deployed; flip this to bring it back. */
export const DAO_VISIBLE = false;
export const daoLive = pointsAddress !== zeroAddress && daoAddress !== zeroAddress;

export const pointsAbi = [
  { type: "function", name: "pointsOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "totalPoints", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
] as const;

export const daoAbi = [
  { type: "function", name: "proposalCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    type: "function",
    name: "proposal",
    inputs: [{ type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { type: "address", name: "proposer" },
        { type: "uint48", name: "snapshot" },
        { type: "uint64", name: "start" },
        { type: "uint64", name: "end" },
        { type: "bool", name: "cancelled" },
        { type: "uint256", name: "forVotes" },
        { type: "uint256", name: "againstVotes" },
        { type: "uint256", name: "abstainVotes" },
        { type: "string", name: "title" },
        { type: "string", name: "body" },
      ],
    }],
    stateMutability: "view",
  },
  { type: "function", name: "state", inputs: [{ type: "uint256" }], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "quorumOf", inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }, { type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "voteOf", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "votingPower", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "proposalThreshold", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "votingPeriod", inputs: [], outputs: [{ type: "uint64" }], stateMutability: "view" },
  { type: "function", name: "quorumBps", inputs: [], outputs: [{ type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "propose", inputs: [{ type: "string" }, { type: "string" }], outputs: [{ type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "vote", inputs: [{ type: "uint256" }, { type: "uint8" }], outputs: [], stateMutability: "nonpayable" },
  { type: "error", name: "BelowThreshold", inputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "error", name: "AlreadyVoted", inputs: [] },
  { type: "error", name: "NoVotingPower", inputs: [] },
  { type: "error", name: "NotActive", inputs: [] },
  { type: "error", name: "BadText", inputs: [] },
] as const;

/** Contract enums, in order. */
export const SUPPORT = { Against: 0, For: 1, Abstain: 2 } as const;
export const DAO_STATES = ["Active", "Passed", "Defeated", "Cancelled"] as const;
export type DaoState = (typeof DAO_STATES)[number];
