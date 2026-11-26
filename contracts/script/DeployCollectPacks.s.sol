// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CollectPacks, ICollectPoints} from "../src/CollectPacks.sol";
import {CollectPoints} from "../src/CollectPoints.sol";
import {CollectDAO, IPoints} from "../src/CollectDAO.sol";
import {CollectMarket} from "../src/CollectMarket.sol";
import {CollectChat} from "../src/CollectChat.sol";
import {CollectNames} from "../src/CollectNames.sol";
import {CollectProfiles, IStakes} from "../src/CollectProfiles.sol";
import {CollectStaking, ICollectCards} from "../src/CollectStaking.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {MainnetConfig} from "./MainnetConfig.sol";

/// Deploys the Grailio contracts on BNB Smart Chain: packs (three $1 tiers, five tokens; Ember on sale),
/// staking, market, points, DAO, chat, names, profiles.
///
/// Revenue split (pack edge + market USDC fees), set from env at deploy:
///   STAKING_BPS  share to stakers, default 5000 (50%)
///   DAO_ADDRESS  wallet for the DAO share, default none
///   DAO_BPS      share to DAO_ADDRESS, default 0
/// The rest stays in the pack pool for the owner to withdraw. Change later with setShares.
///
/// Dry run (simulates against mainnet, sends nothing):
///   forge script script/DeployCollectPacks.s.sol --rpc-url bsc --account grailio-mainnet-deployer
/// Real deploy:
///   forge script script/DeployCollectPacks.s.sol --rpc-url bsc --account grailio-mainnet-deployer --broadcast --verify
///
/// The deployer stays owner unless NEW_OWNER is set; then ownership is offered to it
/// and NEW_OWNER (e.g. a Safe) must call acceptOwnership() to take over.
/// The pool starts empty: send USDC to the contract to seed it before selling.
contract DeployCollectPacks is Script {
    function run() external returns (CollectPacks packs, CollectMarket market, CollectPoints points, CollectDAO dao) {
        address newOwner = vm.envOr("NEW_OWNER", address(0));
        uint16 stakingBps = uint16(vm.envOr("STAKING_BPS", uint256(5000)));
        address daoWallet = vm.envOr("DAO_ADDRESS", address(0));
        uint16 daoBps = uint16(vm.envOr("DAO_BPS", uint256(0)));

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        packs = MainnetConfig.deploy(deployer);
        MainnetConfig.addTiers(packs);
        // Launch with Ember (tier 0) only; Flare and Nova can be switched on later.
        packs.setTierActive(1, false);
        packs.setTierActive(2, false);
        MainnetConfig.addAssets(packs);
        // Card market: BNB or USDC listings; USDC fees are pack-pool revenue.
        market = new CollectMarket(IERC20(MainnetConfig.USDC), address(packs), deployer);
        market.setListable(address(packs), true);
        market.setTreasury(address(packs), true); // USDC fees count as pool revenue
        // DAO points: 1 per pack bought, non-transferable. The DAO votes with them.
        points = new CollectPoints(deployer);
        points.setAwarder(address(packs), true);
        packs.setPoints(ICollectPoints(address(points)), 1);
        dao = new CollectDAO(IPoints(address(points)), deployer);
        // Staking: cards earn the staking share of revenue, paid out with a 7-day half-life.
        CollectStaking staking = new CollectStaking(ICollectCards(address(packs)), IERC20(MainnetConfig.USDC));
        packs.setShares(address(staking), stakingBps, daoWallet, daoBps);
        Community memory c = _deployCommunity(packs, staking, deployer);
        if (newOwner != address(0) && newOwner != deployer) {
            packs.transferOwnership(newOwner);
            market.transferOwnership(newOwner);
            points.transferOwnership(newOwner);
            dao.transferOwnership(newOwner);
            c.chat.transferOwnership(newOwner); // the moderator stays the deployer until changed
        }
        vm.stopBroadcast();

        console.log("CollectPacks:", address(packs));
        console.log("CollectMarket:", address(market));
        console.log("CollectPoints:", address(points));
        console.log("CollectDAO:", address(dao));
        console.log("CollectChat:", address(c.chat));
        console.log("CollectNames:", address(c.names));
        console.log("CollectProfiles:", address(c.profiles));
        console.log("CollectStaking:", address(staking));
        console.log("revenue split, bps: staking", stakingBps, "dao", daoBps);
        console.log("owner:", packs.owner());
        if (newOwner != address(0)) console.log("pending owner (must accept):", newOwner);
        for (uint256 i; i < packs.assetCount(); ++i) {
            require(packs.priceOf(i) > 0, "a Chainlink feed is stale");
        }

        // Only a real broadcast updates the app's deployment file.
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            string memory path = "../deployments/56.json";
            vm.writeJson(vm.toString(address(packs)), path, ".collectPacks");
            vm.writeJson(vm.toString(block.number), path, ".deployBlocks.collectPacks");
            vm.writeJson(vm.toString(address(market)), path, ".collectMarket");
            vm.writeJson(vm.toString(block.number), path, ".deployBlocks.collectMarket");
            vm.writeJson(vm.toString(address(points)), path, ".collectPoints");
            vm.writeJson(vm.toString(address(dao)), path, ".collectDao");
            vm.writeJson(vm.toString(address(c.chat)), path, ".collectChat");
            vm.writeJson(vm.toString(block.number), path, ".deployBlocks.collectChat");
            vm.writeJson(vm.toString(address(c.names)), path, ".collectNames");
            vm.writeJson(vm.toString(address(c.profiles)), path, ".collectProfiles");
            vm.writeJson(vm.toString(address(staking)), path, ".collectStaking");
            console.log("wrote", path);
        }
    }

    struct Community {
        CollectChat chat;
        CollectNames names;
        CollectProfiles profiles;
    }

    /// Chat with an open lounge plus one encrypted room per card token (hold or stake a
    /// card of that token to read and post), usernames, and card-avatar profiles.
    /// Rooms and profiles check through staking, so staked cards still count.
    function _deployCommunity(CollectPacks packs, CollectStaking staking, address deployer)
        internal
        returns (Community memory c)
    {
        c.chat = new CollectChat(deployer);
        c.chat.addRoom("The lounge", CollectChat.Gate.Open, address(0), 0, 0, false);
        // Room names are "$" + the card ticker (the app strips the "$" to find the card), in asset order (MainnetConfig.addAssets).
        string[5] memory tickers = ["$BTC", "$ETH", "$WBNB", "$LINK", "$CAKE"];
        for (uint256 i; i < tickers.length; ++i) {
            c.chat.addRoom(tickers[i], CollectChat.Gate.Card, address(staking), i, 1, true);
        }
        c.names = new CollectNames();
        c.profiles = new CollectProfiles(IERC721(address(packs)), IStakes(address(staking)));
    }
}
