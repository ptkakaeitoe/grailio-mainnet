// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {CollectPacks} from "../src/CollectPacks.sol";
import {CollectChat} from "../src/CollectChat.sol";

/// Adds one encrypted chat room per stock card asset (asset IDs 5 and up, added by AddStocks), gated by holding a
/// card of that asset, the same way the deploy added the BTC–CAKE rooms. Room name: the plain ticker ("NVDAB" → "NVDA").
/// Skips assets that already have a card room, so it is safe to re-run after adding more stocks.
/// Must be sent by the CollectChat owner. Run AddStocks first.
///
///   # dry run (nothing is sent)
///   forge script script/AddStockRooms.s.sol --rpc-url bsc --sender <owner>
///   # for real
///   forge script script/AddStockRooms.s.sol --rpc-url bsc --account <owner keystore> --broadcast
contract AddStockRooms is Script {
    uint256 internal constant FIRST_STOCK_ASSET = 5; // 0-4 are the original crypto assets

    function run() external {
        string memory json = vm.readFile("../deployments/56.json");
        CollectPacks packs = CollectPacks(vm.parseJsonAddress(json, ".collectPacks"));
        CollectChat chat = CollectChat(vm.parseJsonAddress(json, ".collectChat"));
        address staking = vm.parseJsonAddress(json, ".collectStaking");

        CollectChat.Room[] memory existing = chat.rooms();
        uint256 count = packs.assetCount();

        vm.startBroadcast();
        (, address sender,) = vm.readCallers();
        require(sender == chat.owner(), "send from the CollectChat owner (--account/--sender)");
        for (uint256 id = FIRST_STOCK_ASSET; id < count; ++id) {
            if (hasCardRoom(existing, staking, id)) continue;
            string memory name = plainTicker(IERC20Metadata(address(packs.asset(id).token)).symbol());
            uint256 roomId = chat.addRoom(name, CollectChat.Gate.Card, staking, id, 1, true);
            console.log(name, "asset", id);
            console.log("  room", roomId);
        }
        vm.stopBroadcast();
    }

    function hasCardRoom(CollectChat.Room[] memory rooms, address staking, uint256 id) internal pure returns (bool) {
        for (uint256 i; i < rooms.length; ++i) {
            if (rooms[i].kind == CollectChat.Gate.Card && rooms[i].gate == staking && rooms[i].gateId == id) return true;
        }
        return false;
    }

    /// bStocks symbols end in "B" (NVDAB); the room is named for the plain ticker.
    function plainTicker(string memory symbol) internal pure returns (string memory) {
        bytes memory b = bytes(symbol);
        if (b.length < 2 || b[b.length - 1] != "B") return symbol;
        bytes memory out = new bytes(b.length - 1);
        for (uint256 i; i < out.length; ++i) out[i] = b[i];
        return string(out);
    }
}
