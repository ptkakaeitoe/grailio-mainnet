// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {MainnetConfig} from "./MainnetConfig.sol";
import {StockConfig} from "./StockConfig.sol";

/// Deploys Grailio on BNB Smart Chain (MainnetConfig.deployAll): packs with 9 tiers (Fable,
/// Saga, Mythos x Low/Medium/High; the Low tiers on sale), the 15 bStock assets from
/// script/stocks.mainnet.json (one AtlasFeedAdapter each), an asset basket per edition,
/// staking, market, points, DAO, chat (lounge + one room per stock), names, profiles.
///
/// Env:
///   STOCKS_JSON  stocks config, default script/stocks.mainnet.json
///   STAKING_BPS  revenue share to stakers, default 5000 (50%)
///   DAO_ADDRESS  wallet for the DAO share, default none
///   DAO_BPS      share to DAO_ADDRESS, default 0
///   NEW_OWNER    offer ownership to this address (e.g. a Safe); it must call acceptOwnership()
/// The rest of the revenue stays in the pack pool for the owner. Change later with setShares.
///
/// Dry run (simulates against mainnet, sends nothing):
///   forge script script/DeployCollectPacks.s.sol --rpc-url bsc --account grailio-mainnet-deployer
/// Real deploy:
///   forge script script/DeployCollectPacks.s.sol --rpc-url bsc --account grailio-mainnet-deployer --broadcast --verify
///
/// The pool starts empty: Low tiers need no seed; send USDT before turning on Medium/High.
contract DeployCollectPacks is Script {
    function run() external returns (MainnetConfig.Deployment memory d) {
        string memory json = vm.readFile(vm.envOr("STOCKS_JSON", string(StockConfig.DEFAULT_PATH)));
        MainnetConfig.Params memory p = MainnetConfig.Params({
            deployer: address(0),
            newOwner: vm.envOr("NEW_OWNER", address(0)),
            stakingBps: uint16(vm.envOr("STAKING_BPS", uint256(5000))),
            daoWallet: vm.envOr("DAO_ADDRESS", address(0)),
            daoBps: uint16(vm.envOr("DAO_BPS", uint256(0)))
        });

        vm.startBroadcast();
        (, p.deployer,) = vm.readCallers();
        d = MainnetConfig.deployAll(p, json);
        vm.stopBroadcast();

        StockConfig.Stock[] memory stocks = StockConfig.load(json);
        console.log("CollectPacks:", address(d.packs));
        console.log("CollectMarket:", address(d.market));
        console.log("CollectPoints:", address(d.points));
        console.log("CollectDAO:", address(d.dao));
        console.log("CollectChat:", address(d.chat));
        console.log("CollectNames:", address(d.names));
        console.log("CollectProfiles:", address(d.profiles));
        console.log("CollectStaking:", address(d.staking));
        console.log("revenue split, bps: staking", p.stakingBps, "dao", p.daoBps);
        console.log("owner:", d.packs.owner());
        if (p.newOwner != address(0)) console.log("pending owner (must accept):", p.newOwner);
        for (uint256 i; i < stocks.length; ++i) {
            console.log(stocks[i].ticker, i, address(d.adapters[i]));
            require(d.packs.priceOf(i) > 0, string.concat(stocks[i].ticker, ": Atlas price is stale or missing"));
        }

        // Only a real broadcast updates the app's deployment file.
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) _write(d, stocks);
    }

    function _write(MainnetConfig.Deployment memory d, StockConfig.Stock[] memory stocks) internal {
        string memory path = "../deployments/56.json";
        string memory blockNo = vm.toString(block.number);
        vm.writeJson(vm.toString(address(d.packs)), path, ".collectPacks");
        vm.writeJson(blockNo, path, ".deployBlocks.collectPacks");
        vm.writeJson(vm.toString(address(d.market)), path, ".collectMarket");
        vm.writeJson(blockNo, path, ".deployBlocks.collectMarket");
        vm.writeJson(vm.toString(address(d.points)), path, ".collectPoints");
        vm.writeJson(vm.toString(address(d.dao)), path, ".collectDao");
        vm.writeJson(vm.toString(address(d.chat)), path, ".collectChat");
        vm.writeJson(blockNo, path, ".deployBlocks.collectChat");
        vm.writeJson(vm.toString(address(d.names)), path, ".collectNames");
        vm.writeJson(vm.toString(address(d.profiles)), path, ".collectProfiles");
        vm.writeJson(vm.toString(address(d.staking)), path, ".collectStaking");
        // stockAssets: ticker -> {assetId, token, atlasFeedId, adapter}. Replaces the old deploy's entries.
        string memory all = "stockAssets";
        string memory assetsJson;
        for (uint256 i; i < stocks.length; ++i) {
            string memory e = stocks[i].ticker;
            vm.serializeUint(e, "assetId", i);
            vm.serializeAddress(e, "token", stocks[i].token);
            vm.serializeUint(e, "atlasFeedId", stocks[i].atlasFeedId);
            assetsJson = vm.serializeString(all, e, vm.serializeAddress(e, "adapter", address(d.adapters[i])));
        }
        vm.writeJson(assetsJson, path, ".stockAssets");
        // baskets: edition -> {assetIds, tiers}.
        string memory bj;
        for (uint256 e; e < MainnetConfig.EDITIONS; ++e) {
            string memory name = MainnetConfig.edition(e);
            uint256[] memory ids = new uint256[](d.baskets[e].length);
            for (uint256 k; k < ids.length; ++k) ids[k] = d.baskets[e][k];
            uint256[] memory tiers = new uint256[](3);
            for (uint256 t; t < 3; ++t) tiers[t] = e * 3 + t;
            vm.serializeUint(name, "assetIds", ids);
            bj = vm.serializeString("baskets", name, vm.serializeUint(name, "tiers", tiers));
        }
        vm.writeJson(bj, path, ".baskets");
        console.log("wrote", path);
    }
}
