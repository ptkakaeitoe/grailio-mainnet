// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice On-chain usernames for Grailio. One name per wallet, one wallet per
/// name. Names are 3–16 characters of a–z, 0–9 and underscore, so they stay
/// unambiguous (no look-alike capitals or unicode). Changing your name frees
/// the old one; `clearName` gives it up.
contract CollectNames {
    mapping(address account => string) public nameOf;
    mapping(bytes32 nameHash => address) private _owner;

    error InvalidName();
    error NameTaken(address owner);

    event NameSet(address indexed account, string name);

    function setName(string calldata name) external {
        if (!isValid(name)) revert InvalidName();
        bytes32 key = keccak256(bytes(name));
        address current = _owner[key];
        if (current == msg.sender) return;
        if (current != address(0)) revert NameTaken(current);

        _release(msg.sender);
        _owner[key] = msg.sender;
        nameOf[msg.sender] = name;
        emit NameSet(msg.sender, name);
    }

    function clearName() external {
        _release(msg.sender);
        emit NameSet(msg.sender, "");
    }

    /// @notice Who holds `name`, or zero if it's free.
    function ownerOf(string calldata name) external view returns (address) {
        return _owner[keccak256(bytes(name))];
    }

    function isValid(string calldata name) public pure returns (bool) {
        bytes calldata b = bytes(name);
        if (b.length < 3 || b.length > 16) return false;
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            bool ok = (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c == "_";
            if (!ok) return false;
        }
        return true;
    }

    function _release(address account) private {
        string memory old = nameOf[account];
        if (bytes(old).length == 0) return;
        delete _owner[keccak256(bytes(old))];
        delete nameOf[account];
    }
}
