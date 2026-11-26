// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {CollectPacks, IAggregatorV3} from "../src/CollectPacks.sol";
import {AtlasFeedAdapter, IAtlasMultiFeed} from "../src/AtlasFeedAdapter.sol";

/// Reads script/stocks.mainnet.json (bStock card assets priced by Atlas) for the deploy
/// script and AddStocks, and adds a stock to CollectPacks.
///
/// maxFeedAge: Atlas pushes bStock prices about every 60 seconds, around the clock (they track
/// 24/7 venues, not only US market hours; measured on chain 2026-11-26, a US holiday). A short
/// limit means a stuck feed stops swaps quickly: cards then keep their USDT until `fill`, which
/// costs nothing but convenience. A long limit would let a card buy at a price hours old. The
/// default, 6 hours, rides out an Atlas outage of a few hours without pausing cards. Override
/// per entry with "maxFeedAge".
library StockConfig {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    IAtlasMultiFeed internal constant ATLAS = IAtlasMultiFeed(0xEAcE519ebB14fB8404fA6DdD23C3b34abaDE44aa);
    address internal constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    uint32 internal constant DEFAULT_MAX_FEED_AGE = 6 hours;
    string internal constant DEFAULT_PATH = "script/stocks.mainnet.json";

    struct Stock {
        string symbol; // token symbol, e.g. NVDAB
        string ticker; // plain ticker, e.g. NVDA: room name and deployments key
        string todo;
        address token;
        uint32 atlasFeedId;
        uint32 maxFeedAge;
        uint16 maxSlippageBps;
        CollectPacks.Route route;
        bytes v3Path;
        address[] v2Path;
    }

    /// Deploy the adapter and add the asset. Caller must be the CollectPacks owner.
    function add(CollectPacks packs, Stock memory s) internal returns (AtlasFeedAdapter adapter, uint256 id) {
        adapter = new AtlasFeedAdapter(ATLAS, s.atlasFeedId, string.concat(s.ticker, " / USD (Atlas)"));
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

    /// Refuse to run while any entry still has a "todo".
    function requireNoTodo(Stock[] memory stocks) internal pure {
        for (uint256 i; i < stocks.length; ++i) {
            require(bytes(stocks[i].todo).length == 0, string.concat(stocks[i].symbol, ": remove its \"todo\" first"));
        }
    }

    /// Parse and check the `stocks` list.
    function load(string memory json) internal view returns (Stock[] memory stocks) {
        uint256 n;
        while (vm.keyExistsJson(json, _k(n, ""))) ++n;
        require(n > 0, "no stocks in config");
        stocks = new Stock[](n);
        for (uint256 i; i < n; ++i) {
            Stock memory s = stocks[i];
            s.symbol = vm.parseJsonString(json, _k(i, ".symbol"));
            s.ticker = vm.keyExistsJson(json, _k(i, ".ticker")) ? vm.parseJsonString(json, _k(i, ".ticker")) : s.symbol;
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
                require(s.v2Path.length >= 2 && s.v2Path[0] == USDT, string.concat(s.symbol, ": v2Path must start at USDT"));
                require(s.v2Path[s.v2Path.length - 1] == s.token, string.concat(s.symbol, ": v2Path must end at token"));
            } else {
                revert(string.concat(s.symbol, ": route must be \"v3\" or \"v2\""));
            }
            require(s.maxFeedAge > 0, string.concat(s.symbol, ": maxFeedAge is 0"));
            require(s.maxSlippageBps <= 1_000, string.concat(s.symbol, ": maxSlippageBps above 1000"));
        }
    }

    /// `baskets.<edition>` as indexes into `stocks` (= asset IDs on a fresh deploy), by ticker.
    function basket(string memory json, string memory edition, Stock[] memory stocks)
        internal
        pure
        returns (uint8[] memory ids)
    {
        string[] memory tickers = vm.parseJsonStringArray(json, string.concat(".baskets.", edition));
        require(tickers.length > 0, string.concat("empty basket: ", edition));
        ids = new uint8[](tickers.length);
        for (uint256 t; t < tickers.length; ++t) {
            ids[t] = indexOf(stocks, tickers[t]);
        }
    }

    function indexOf(Stock[] memory stocks, string memory ticker) internal pure returns (uint8) {
        for (uint256 i; i < stocks.length; ++i) {
            if (keccak256(bytes(stocks[i].ticker)) == keccak256(bytes(ticker))) return uint8(i);
        }
        revert(string.concat("basket ticker not in stocks: ", ticker));
    }

    /// [{token, fee}, ..., {token}] -> token fee token ... token (Uniswap v3 packed path).
    function _v3Path(string memory json, uint256 i) private view returns (bytes memory path) {
        string memory base = _k(i, ".v3Path");
        uint256 hops;
        while (vm.keyExistsJson(json, _hop(base, hops))) ++hops;
        require(hops >= 2, "v3Path needs at least 2 hops");
        for (uint256 h; h < hops; ++h) {
            path = bytes.concat(path, _v3Hop(json, _hop(base, h), h + 1 < hops));
        }
        require(address(bytes20(path)) == USDT, "v3Path must start at USDT");
        require(_lastToken(path) == vm.parseJsonAddress(json, _k(i, ".token")), "v3Path must end at token");
    }

    function _v3Hop(string memory json, string memory hop, bool withFee) private pure returns (bytes memory) {
        address token = vm.parseJsonAddress(json, string.concat(hop, ".token"));
        if (!withFee) return abi.encodePacked(token);
        return abi.encodePacked(token, uint24(vm.parseJsonUint(json, string.concat(hop, ".fee"))));
    }

    function _lastToken(bytes memory path) private pure returns (address token) {
        assembly {
            token := shr(96, mload(add(add(path, 32), sub(mload(path), 20))))
        }
    }

    function _hop(string memory base, uint256 h) private pure returns (string memory) {
        return string.concat(base, "[", vm.toString(h), "]");
    }

    function _k(uint256 i, string memory field) private pure returns (string memory) {
        return string.concat(".stocks[", vm.toString(i), "]", field);
    }
}
