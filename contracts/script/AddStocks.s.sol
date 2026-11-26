// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {CollectPacks} from "../src/CollectPacks.sol";
import {AtlasFeedAdapter} from "../src/AtlasFeedAdapter.sol";
import {StockConfig} from "./StockConfig.sol";

/// Adds more bStock card assets to the deployed CollectPacks (address from ../deployments/56.json),
/// priced by Atlas Oracle. For each entry in the stocks config whose token isn't an asset yet:
/// deploy an AtlasFeedAdapter for its feed ID, then `addAsset` it. Stocks already added (e.g.
/// the 15 the deploy script added) are skipped, so the shared config can simply grow.
/// Must be sent by the CollectPacks owner.
///
/// Env:
///   STOCKS_JSON  config path, default script/stocks.mainnet.json
///   TIERS        optional, comma-separated tier IDs (e.g. 0,1,2 for Fable): the new stocks join
///                each tier's basket. A tier with no basket draws from every active asset
///                already, so it is refused here (it would narrow it to just the new stocks).
///
/// Dry run (simulates against mainnet, sends nothing):
///   forge script script/AddStocks.s.sol --rpc-url bsc --sender <owner>
/// Real run (writes adapters and asset IDs to ../deployments/56.json under "stockAssets"):
///   forge script script/AddStocks.s.sol --rpc-url bsc --account <owner keystore> --broadcast --verify
/// Then add their chat rooms with AddStockRooms.
contract AddStocks is Script {
    function run() external {
        string memory deployments = vm.readFile("../deployments/56.json");
        CollectPacks packs = CollectPacks(vm.parseJsonAddress(deployments, ".collectPacks"));
        StockConfig.Stock[] memory all =
            StockConfig.load(vm.readFile(vm.envOr("STOCKS_JSON", string(StockConfig.DEFAULT_PATH))));
        StockConfig.Stock[] memory stocks = newStocks(packs, all);
        StockConfig.requireNoTodo(stocks);
        uint256[] memory tiers = vm.envOr("TIERS", ",", new uint256[](0));
        if (stocks.length == 0) {
            console.log("every stock in the config is already an asset");
            return;
        }

        vm.startBroadcast();
        (, address sender,) = vm.readCallers();
        require(sender == packs.owner(), "send from the CollectPacks owner (--account/--sender)");
        AtlasFeedAdapter[] memory adapters = new AtlasFeedAdapter[](stocks.length);
        uint256[] memory ids = new uint256[](stocks.length);
        for (uint256 i; i < stocks.length; ++i) {
            (adapters[i], ids[i]) = StockConfig.add(packs, stocks[i]);
        }
        for (uint256 t; t < tiers.length; ++t) {
            packs.setTierAssets(tiers[t], withAssets(packs.tierAssetMask(tiers[t]), ids));
            console.log("tier", tiers[t], "basket mask", packs.tierAssetMask(tiers[t]));
        }
        vm.stopBroadcast();

        for (uint256 i; i < stocks.length; ++i) {
            console.log(stocks[i].ticker);
            console.log("  asset id:", ids[i]);
            console.log("  adapter :", address(adapters[i]));
            console.log("  price   :", packs.priceOf(ids[i]));
            require(packs.priceOf(ids[i]) > 0, "Atlas price is stale or missing");
        }

        // Only a real broadcast updates the app's deployment file.
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            string memory out = "../deployments/56.json";
            // One key per ticker under "stockAssets"; entries from earlier runs stay.
            for (uint256 i; i < stocks.length; ++i) {
                string memory e = stocks[i].ticker;
                vm.serializeUint(e, "assetId", ids[i]);
                vm.serializeAddress(e, "token", stocks[i].token);
                vm.serializeUint(e, "atlasFeedId", stocks[i].atlasFeedId);
                string memory json = vm.serializeAddress(e, "adapter", address(adapters[i]));
                vm.writeJson(json, out, string.concat(".stockAssets.", e));
            }
            console.log("wrote", out, "(update its \"baskets\" by hand if you used TIERS)");
        }
    }

    /// Config entries whose token is not yet a CollectPacks asset.
    function newStocks(CollectPacks packs, StockConfig.Stock[] memory all)
        public
        view
        returns (StockConfig.Stock[] memory out)
    {
        uint256 n = packs.assetCount();
        out = new StockConfig.Stock[](all.length);
        uint256 k;
        for (uint256 i; i < all.length; ++i) {
            bool known;
            for (uint256 id; id < n && !known; ++id) {
                known = address(packs.asset(id).token) == all[i].token;
            }
            if (!known) out[k++] = all[i];
        }
        assembly {
            mstore(out, k)
        }
    }

    /// The basket `mask` plus `ids`, as the asset-ID list setTierAssets takes.
    function withAssets(uint256 mask, uint256[] memory ids) public pure returns (uint8[] memory list) {
        require(mask != 0, "tier has no basket (it draws from every asset); set it with setTierAssets instead");
        for (uint256 i; i < ids.length; ++i) {
            mask |= 1 << ids[i];
        }
        list = new uint8[](256);
        uint256 k;
        for (uint256 id; id < 256; ++id) {
            if (mask >> id & 1 == 1) list[k++] = uint8(id);
        }
        assembly {
            mstore(list, k)
        }
    }
}
