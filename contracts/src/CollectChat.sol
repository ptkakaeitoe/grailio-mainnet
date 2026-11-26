// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// Cards a wallet holds per asset (CollectPacks.heldOf).
interface ICardHoldings {
    function heldOf(address owner, uint256 assetId) external view returns (uint256);
}

/// @notice On-chain community chat for Grailio. Messages are events on
/// BNB Chain; the contract enforces who may post in each room: open rooms let
/// any registered wallet post, card rooms need at least one card of that
/// room's token (e.g. a BTC card for the BTC room).
///
/// Gasless by design, without trusting the relayer:
///  - A wallet signs one EIP-712 `Register` to authorise a browser session
///    key and publish its X25519 chat key. Anyone (the app's relayer) can
///    submit it.
///  - Each message is signed by the session key; anyone can submit it. The
///    relayer only pays gas: it can't forge, alter or read messages.
///  - Wallets can always post directly with `post`, so the relayer can't
///    censor either.
///
/// Registration needs two signatures: the wallet's (it authorises the session
/// key) and the session key's own (proof the registrant holds it). Owners can
/// `revoke` a session at any time.
///
/// Moderation: a moderator can mute an account, which blocks its new posts.
/// Past messages are events and can't be deleted; the app hides muted
/// accounts. Mutes are public on-chain.
///
/// Bodies are opaque bytes. The app sends plain text to open rooms and, for
/// encrypted rooms, a ciphertext addressed to each current holder's chat key,
/// so only holders can read, and only holders can post.
contract CollectChat is Ownable2Step, EIP712 {
    uint256 public constant MAX_BODY = 12_000;

    enum Gate {
        Open,
        Token, // ERC20 balance
        Card // cards of one asset in `gate` (CollectPacks)
    }

    struct Room {
        string name;
        Gate kind;
        address gate;
        uint256 gateId; // asset id for card rooms
        uint256 minBalance;
        bool encrypted;
    }

    struct Session {
        address owner;
        uint64 expiry;
    }

    bytes32 private constant REGISTER_TYPEHASH =
        keccak256("Register(address owner,address sessionKey,uint64 expiry,bytes32 chatKey,uint256 nonce)");
    bytes32 private constant SESSION_TYPEHASH = keccak256("Session(address owner,uint64 expiry,uint256 nonce)");
    bytes32 private constant POST_TYPEHASH = keccak256("Post(uint256 roomId,bytes32 bodyHash,bytes32 salt)");

    Room[] private _rooms;
    mapping(address sessionKey => Session) public sessions;
    mapping(address account => bytes32) public chatKeyOf;
    mapping(address account => uint256) public nonces;
    mapping(bytes32 digest => bool) public usedPost;
    address[] private _members;
    address public moderator;
    mapping(address account => bool) public muted;

    error UnknownRoom(uint256 roomId);
    error NotAllowed(uint256 roomId, address author);
    error NotRegistered(address author);
    error BadSignature();
    error SessionExpired(address sessionKey);
    error AlreadyPosted();
    error BodyTooLong(uint256 length);
    error SessionTaken(address sessionKey);
    error NotModerator();
    error Muted(address account);
    error BadRoom();

    event RoomAdded(uint256 indexed roomId, string name, Gate kind, address gate, uint256 gateId, bool encrypted);
    event Registered(address indexed owner, address indexed sessionKey, uint64 expiry, bytes32 chatKey);
    event Message(uint256 indexed roomId, address indexed author, bytes body, uint64 time);
    event Revoked(address indexed owner, address indexed sessionKey);
    event MutedSet(address indexed account, bool muted);
    event ModeratorSet(address indexed moderator);

    constructor(address owner_) Ownable(owner_) EIP712("CollectChat", "1") {
        moderator = owner_;
        emit ModeratorSet(owner_);
    }

    // ---- identity ----------------------------------------------------------

    /// Registers a session key + chat key for `owner`, authorised by the owner's
    /// EIP-712 `Register` signature and the session key's own `Session`
    /// signature. Submittable by anyone.
    function register(
        address owner_,
        address sessionKey,
        uint64 expiry,
        bytes32 chatKey,
        bytes calldata ownerSignature,
        bytes calldata sessionSignature
    ) external {
        uint256 nonce = nonces[owner_];
        bytes32 ownerDigest =
            _hashTypedDataV4(keccak256(abi.encode(REGISTER_TYPEHASH, owner_, sessionKey, expiry, chatKey, nonce)));
        if (ECDSA.recover(ownerDigest, ownerSignature) != owner_) revert BadSignature();
        bytes32 sessionDigest = _hashTypedDataV4(keccak256(abi.encode(SESSION_TYPEHASH, owner_, expiry, nonce)));
        if (ECDSA.recover(sessionDigest, sessionSignature) != sessionKey) revert BadSignature();
        address current = sessions[sessionKey].owner;
        if (current != address(0) && current != owner_) revert SessionTaken(sessionKey);

        nonces[owner_] = nonce + 1;
        if (chatKeyOf[owner_] == bytes32(0)) _members.push(owner_);
        chatKeyOf[owner_] = chatKey;
        sessions[sessionKey] = Session(owner_, expiry);
        emit Registered(owner_, sessionKey, expiry, chatKey);
    }

    /// Ends one of your sessions immediately (lost device, leaked key).
    function revoke(address sessionKey) external {
        if (sessions[sessionKey].owner != msg.sender) revert NotAllowed(0, msg.sender);
        delete sessions[sessionKey];
        emit Revoked(msg.sender, sessionKey);
    }

    // ---- posting -----------------------------------------------------------

    /// Posts on behalf of a session key's owner. `salt` makes each signature single-use.
    function postFor(uint256 roomId, bytes calldata body, bytes32 salt, bytes calldata signature) external {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(POST_TYPEHASH, roomId, keccak256(body), salt)));
        if (usedPost[digest]) revert AlreadyPosted();
        usedPost[digest] = true;

        address sessionKey = ECDSA.recover(digest, signature);
        Session memory s = sessions[sessionKey];
        if (s.owner == address(0)) revert BadSignature();
        if (block.timestamp > s.expiry) revert SessionExpired(sessionKey);
        _post(roomId, s.owner, body);
    }

    /// Posts directly from a wallet (pays its own gas). Needs a chat key registered.
    function post(uint256 roomId, bytes calldata body) external {
        _post(roomId, msg.sender, body);
    }

    /// Whether `author` meets the room's gate (ignores registration and mutes).
    function holds(uint256 roomId, address author) public view returns (bool) {
        Room storage room = _room(roomId);
        if (room.kind == Gate.Open) return true;
        if (room.kind == Gate.Token) return IERC20(room.gate).balanceOf(author) >= room.minBalance;
        return ICardHoldings(room.gate).heldOf(author, room.gateId) >= room.minBalance;
    }

    function canPost(uint256 roomId, address author) public view returns (bool) {
        return chatKeyOf[author] != bytes32(0) && !muted[author] && holds(roomId, author);
    }

    // ---- views -------------------------------------------------------------

    function rooms() external view returns (Room[] memory) {
        return _rooms;
    }

    /// Everyone with a chat key, and their keys. Clients filter this by each
    /// room's gate to find its current readers.
    function members() external view returns (address[] memory accounts, bytes32[] memory keys) {
        accounts = _members;
        keys = new bytes32[](accounts.length);
        for (uint256 i; i < accounts.length; ++i) {
            keys[i] = chatKeyOf[accounts[i]];
        }
    }

    // ---- admin -------------------------------------------------------------

    /// Blocks (or unblocks) an account's new posts.
    function setMuted(address account, bool isMuted) external {
        if (msg.sender != moderator) revert NotModerator();
        muted[account] = isMuted;
        emit MutedSet(account, isMuted);
    }

    /// Hands moderation to someone else, or renounces it with address(0).
    function setModerator(address newModerator) external onlyOwner {
        moderator = newModerator;
        emit ModeratorSet(newModerator);
    }

    function addRoom(string calldata name, Gate kind, address gate, uint256 gateId, uint256 minBalance, bool encrypted)
        external
        onlyOwner
        returns (uint256 roomId)
    {
        if (bytes(name).length == 0) revert BadRoom();
        if (kind != Gate.Open && (gate == address(0) || minBalance == 0)) revert BadRoom();
        roomId = _rooms.length;
        _rooms.push(Room(name, kind, gate, gateId, minBalance, encrypted));
        emit RoomAdded(roomId, name, kind, gate, gateId, encrypted);
    }

    // ---- internals ---------------------------------------------------------

    function _post(uint256 roomId, address author, bytes calldata body) private {
        if (body.length > MAX_BODY) revert BodyTooLong(body.length);
        if (chatKeyOf[author] == bytes32(0)) revert NotRegistered(author);
        if (muted[author]) revert Muted(author);
        if (!holds(roomId, author)) revert NotAllowed(roomId, author);
        emit Message(roomId, author, body, uint64(block.timestamp));
    }

    function _room(uint256 roomId) private view returns (Room storage) {
        if (roomId >= _rooms.length) revert UnknownRoom(roomId);
        return _rooms[roomId];
    }
}
