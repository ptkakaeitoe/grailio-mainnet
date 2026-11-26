// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {CollectPacks, IAggregatorV3} from "../src/CollectPacks.sol";
import {AtlasFeedAdapter, IAtlasMultiFeed} from "../src/AtlasFeedAdapter.sol";

/// Adds bStock card assets to the deployed CollectPacks, priced by Atlas Oracle.
/// For each entry in script/stocks.mainnet.json: deploy an AtlasFeedAdapter for its feed ID,
/// then `addAsset` it. Must be sent by the CollectPacks owner.
///
/// Env:
///   STOCKS_JSON     config path, default script/stocks.mainnet.json
///   DISABLE_CRYPTO  1 = also setAssetActive(id, false) for the 5 crypto assets (IDs 0-4)
///
/// Dry run (simulates against mainnet, sends nothing):
///   forge script script/AddStocks.s.sol --rpc-url bsc --account <owner keystore>
/// Real run (writes adapters and asset IDs to ../deployments/56.json under "stockAssets"):
///   forge script script/AddStocks.s.sol --rpc-url bsc --account <owner keystore> --broadcast --verify
///
/// maxFeedAge: Atlas pushes bStock prices about every 60 seconds, around the clock (they track
/// 24/7 venues, not only US market hours; measured on chain 2026-11-26, a US holiday). A short
/// limit means a stuck feed stops swaps quickly: cards then keep their USDC until `fill`, which
/// costs nothing but convenience. A long limit would let a card buy at a price hours old. The
/// default, 6 hours, rides out an Atlas outage of a few hours without pausing cards and is still
/// far tighter than the crypto assets' 1 day. Override per entry with "maxFeedAge".
contract AddStocks is Script {
    CollectPacks internal constant PACKS = CollectPacks(0xbdeb4324F9Ec736D1146798872E52E67cDE23DE5);
    IAtlasMultiFeed internal constant ATLAS = IAtlasMultiFeed(0xEAcE519ebB14fB8404fA6DdD23C3b34abaDE44aa);
    address internal constant USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    uint32 internal constant DEFAULT_MAX_FEED_AGE = 6 hours;
    uint256 internal constant CRYPTO_ASSETS = 5; // BTCB, ETH, WBNB, LINK, CAKE (MainnetConfig.addAssets)

    struct Stock {
        string symbol;
        string todo;
        address token;
        uint32 atlasFeedId;
        uint32 maxFeedAge;
        uint16 maxSlippageBps;
        CollectPacks.Route route;
        bytes v3Path;
        address[] v2Path;
    }

    function run() external {
        string memory path = vm.envOr("STOCKS_JSON", string("script/stocks.mainnet.json"));
        Stock[] memory stocks = load(vm.readFile(path));
        for (uint256 i; i < stocks.length; ++i) {
            require(bytes(stocks[i].todo).length == 0, string.concat(stocks[i].symbol, ": remove its \"todo\" first"));
        }
        bool disableCrypto = vm.envOr("DISABLE_CRYPTO", false);

        vm.startBroadcast();
        (, address sender,) = vm.readCallers();
        require(sender == PACKS.owner(), "send from the CollectPacks owner (--account/--sender)");
        AtlasFeedAdapter[] memory adapters = new AtlasFeedAdapter[](stocks.length);
        uint256[] memory ids = new uint256[](stocks.length);
        for (uint256 i; i < stocks.length; ++i) {
            (adapters[i], ids[i]) = add(PACKS, stocks[i]);
        }
        if (disableCrypto) {
            for (uint256 id; id < CRYPTO_ASSETS; ++id) {
                PACKS.setAssetActive(id, false);
            }
        }
        vm.stopBroadcast();

        for (uint256 i; i < stocks.length; ++i) {
            console.log(stocks[i].symbol);
            console.log("  asset id:", ids[i]);
            console.log("  adapter :", address(adapters[i]));
            console.log("  price   :", PACKS.priceOf(ids[i]));
            require(PACKS.priceOf(ids[i]) > 0, "Atlas price is stale or missing");
        }
        if (disableCrypto) console.log("crypto assets 0-4 deactivated");

        // Only a real broadcast updates the app's deployment file.
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            string memory out = "../deployments/56.json";
            // One key per symbol under "stockAssets"; entries from earlier runs stay.
            for (uint256 i; i < stocks.length; ++i) {
                string memory e = stocks[i].symbol;
                vm.serializeUint(e, "assetId", ids[i]);
                vm.serializeAddress(e, "token", stocks[i].token);
                vm.serializeUint(e, "atlasFeedId", stocks[i].atlasFeedId);
                string memory json = vm.serializeAddress(e, "adapter", address(adapters[i]));
                vm.writeJson(json, out, string.concat(".stockAssets.", stocks[i].symbol));
            }
            console.log("wrote", out);
        }
    }

    /// Deploy the adapter and add the asset. Caller must be the owner (broadcast or prank).
    function add(CollectPacks packs, Stock memory s) public returns (AtlasFeedAdapter adapter, uint256 id) {
        adapter = new AtlasFeedAdapter(ATLAS, s.atlasFeedId, string.concat(s.symbol, " / USD (Atlas)"));
        id = packs.addAsset(
            IERC20Metadata(s.token),
            IAggregatorV3(address(adapter)),
            s.maxFeedAge,
            s.maxSlippageBps,
            s.route,
            s.v3Path,
            s.v2Path
        );
    }

    /// Parse and check the config.
    function load(string memory json) public view returns (Stock[] memory stocks) {
        uint256 n;
        while (vm.keyExistsJson(json, _k(n, ""))) ++n;
        require(n > 0, "no stocks in config");
        stocks = new Stock[](n);
        for (uint256 i; i < n; ++i) {
            Stock memory s = stocks[i];
            s.symbol = vm.parseJsonString(json, _k(i, ".symbol"));
            if (vm.keyExistsJson(json, _k(i, ".todo"))) s.todo = vm.parseJsonString(json, _k(i, ".todo"));
            s.token = vm.parseJsonAddress(json, _k(i, ".token"));
            s.atlasFeedId = uint32(vm.parseJsonUint(json, _k(i, ".atlasFeedId")));
            s.maxFeedAge = vm.keyExistsJson(json, _k(i, ".maxFeedAge"))
                ? uint32(vm.parseJsonUint(json, _k(i, ".maxFeedAge")))
                : DEFAULT_MAX_FEED_AGE;
            s.maxSlippageBps = uint16(vm.parseJsonUint(json, _k(i, ".maxSlippageBps")));
            bytes32 route = keccak256(bytes(vm.parseJsonString(json, _k(i, ".route"))));
            if (route == keccak256("v3")) {
                s.route = CollectPacks.Route.UniswapV3;
                s.v3Path = _v3Path(json, i);
            } else if (route == keccak256("v2")) {
                s.route = CollectPacks.Route.V2;
                s.v2Path = vm.parseJsonAddressArray(json, _k(i, ".v2Path"));
                require(s.v2Path.length >= 2 && s.v2Path[0] == USDC, string.concat(s.symbol, ": v2Path must start at USDC"));
                require(s.v2Path[s.v2Path.length - 1] == s.token, string.concat(s.symbol, ": v2Path must end at token"));
            } else {
                revert(string.concat(s.symbol, ": route must be \"v3\" or \"v2\""));
            }
            require(s.maxFeedAge > 0, string.concat(s.symbol, ": maxFeedAge is 0"));
            require(s.maxSlippageBps <= 1_000, string.concat(s.symbol, ": maxSlippageBps above 1000"));
        }
    }

    /// [{token, fee}, ..., {token}] -> token fee token ... token (Uniswap v3 packed path).
    function _v3Path(string memory json, uint256 i) internal view returns (bytes memory path) {
        string memory base = _k(i, ".v3Path");
        uint256 hops;
        while (vm.keyExistsJson(json, string.concat(base, "[", vm.toString(hops), "]"))) ++hops;
        require(hops >= 2, "v3Path needs at least 2 hops");
        address last;
        for (uint256 h; h < hops; ++h) {
            string memory hop = string.concat(base, "[", vm.toString(h), "]");
            last = vm.parseJsonAddress(json, string.concat(hop, ".token"));
            if (h == 0) require(last == USDC, "v3Path must start at USDC");
            path = abi.encodePacked(path, last);
            if (h + 1 < hops) path = abi.encodePacked(path, uint24(vm.parseJsonUint(json, string.concat(hop, ".fee"))));
        }
        require(last == vm.parseJsonAddress(json, _k(i, ".token")), "v3Path must end at token");
    }

    function _k(uint256 i, string memory field) internal pure returns (string memory) {
        return string.concat(".stocks[", vm.toString(i), "]", field);
    }
}
