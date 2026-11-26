// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {CollectPacks, IAggregatorV3, ISwapRouter02, IV2Router} from "../src/CollectPacks.sol";
import {CollectChat} from "../src/CollectChat.sol";
import {CollectNames} from "../src/CollectNames.sol";
import {CollectProfiles, IStakes} from "../src/CollectProfiles.sol";
import {MockFeed, MockRouter, MockToken} from "./Mocks.sol";

contract CollectChatTest is Test {
    CollectPacks packs;
    CollectChat chat;
    MockToken usdc;

    address owner = makeAddr("owner");
    uint256 aliceKey = 0xA11CE;
    uint256 aliceSessionKey = 0xA11CE5;
    uint256 bobKey = 0xB0B;
    uint256 bobSessionKey = 0xB0B5;
    address alice;
    address bob;

    uint256 lounge;
    uint256 btcRoom;
    uint256 joeRoom;
    uint256 aliceCard; // a BTC card

    bytes32 constant REGISTER_TYPEHASH =
        keccak256("Register(address owner,address sessionKey,uint64 expiry,bytes32 chatKey,uint256 nonce)");
    bytes32 constant SESSION_TYPEHASH = keccak256("Session(address owner,uint64 expiry,uint256 nonce)");
    bytes32 constant POST_TYPEHASH = keccak256("Post(uint256 roomId,bytes32 bodyHash,bytes32 salt)");

    function setUp() public {
        vm.warp(1_800_000_000);
        alice = vm.addr(aliceKey);
        bob = vm.addr(bobKey);
        usdc = new MockToken("USDC", 6);
        MockToken btc = new MockToken("BTC.b", 8);
        MockToken joe = new MockToken("JOE", 18);
        MockRouter router = new MockRouter(usdc);
        router.setPrice(address(btc), 60_000e8, 8);
        router.setPrice(address(joe), 0.02e8, 18);

        packs = new CollectPacks(usdc, ISwapRouter02(address(router)), IV2Router(address(router)), owner);
        chat = new CollectChat(owner);
        vm.startPrank(owner);
        packs.addTier(1e6, [uint16(5000), 2500, 2000, 500], [uint128(0.82e6), 0.9e6, 1.04e6, 1.34e6]);
        address[] memory none;
        packs.addAsset(
            IERC20Metadata(address(btc)), IAggregatorV3(address(new MockFeed(60_000e8))), 1 days, 200,
            CollectPacks.Route.UniswapV3, abi.encodePacked(address(usdc), uint24(500), address(btc)), none
        );
        address[] memory v2 = new address[](2);
        v2[0] = address(usdc);
        v2[1] = address(joe);
        packs.addAsset(
            IERC20Metadata(address(joe)), IAggregatorV3(address(new MockFeed(0.02e8))), 1 days, 600,
            CollectPacks.Route.V2, "", v2
        );
        packs.setAssetActive(1, false); // so alice's pack rolls BTC
        lounge = chat.addRoom("The lounge", CollectChat.Gate.Open, address(0), 0, 0, false);
        btcRoom = chat.addRoom("$BTC", CollectChat.Gate.Card, address(packs), 0, 1, true);
        joeRoom = chat.addRoom("$JOE", CollectChat.Gate.Card, address(packs), 1, 1, true);
        vm.stopPrank();

        usdc.mint(address(packs), 10e6);
        usdc.mint(alice, 10e6);
        vm.prank(alice);
        usdc.approve(address(packs), type(uint256).max);
        vm.prank(alice);
        uint256 packId = packs.buy(0, 1);
        vm.roll(vm.getBlockNumber() + 2);
        vm.setBlockhash(vm.getBlockNumber() - 1, keccak256("h"));
        vm.prank(alice);
        aliceCard = packs.open(packId);
        vm.prank(owner);
        packs.setAssetActive(1, true);
    }

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = chat.eip712Domain();
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifying
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domain, structHash));
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _register(uint256 walletKey, uint256 sessionKey) internal {
        address who = vm.addr(walletKey);
        address session = vm.addr(sessionKey);
        uint64 expiry = uint64(vm.getBlockTimestamp() + 7 days);
        bytes32 chatKey = keccak256(abi.encode("x25519", who));
        uint256 nonce = chat.nonces(who);
        bytes memory ownerSig =
            _sign(walletKey, _digest(keccak256(abi.encode(REGISTER_TYPEHASH, who, session, expiry, chatKey, nonce))));
        bytes memory sessionSig = _sign(sessionKey, _digest(keccak256(abi.encode(SESSION_TYPEHASH, who, expiry, nonce))));
        chat.register(who, session, expiry, chatKey, ownerSig, sessionSig); // submitted by anyone (the relayer)
    }

    function _postSig(uint256 sessionKey, uint256 roomId, bytes memory body, bytes32 salt) internal view returns (bytes memory) {
        return _sign(sessionKey, _digest(keccak256(abi.encode(POST_TYPEHASH, roomId, keccak256(body), salt))));
    }

    function _postFor(uint256 sessionKey, uint256 roomId, bytes memory body, bytes32 salt) internal {
        chat.postFor(roomId, body, salt, _postSig(sessionKey, roomId, body, salt));
    }

    // ---- holdings ----

    function test_heldOfTracksMintTransferAndRedeem() public {
        assertEq(packs.heldOf(alice, 0), 1);
        vm.prank(alice);
        packs.transferFrom(alice, bob, aliceCard);
        assertEq(packs.heldOf(alice, 0), 0);
        assertEq(packs.heldOf(bob, 0), 1);
        vm.prank(bob);
        packs.redeem(aliceCard);
        assertEq(packs.heldOf(bob, 0), 0);
    }

    // ---- chat ----

    function test_registerAndPostGasless() public {
        _register(aliceKey, aliceSessionKey);
        assertTrue(chat.chatKeyOf(alice) != bytes32(0));
        vm.expectEmit(true, true, false, true);
        emit CollectChat.Message(lounge, alice, bytes("gm"), uint64(vm.getBlockTimestamp()));
        _postFor(aliceSessionKey, lounge, "gm", bytes32("1"));
        (address[] memory accounts,) = chat.members();
        assertEq(accounts.length, 1);
    }

    function test_cardRoomNeedsACardOfThatToken() public {
        _register(aliceKey, aliceSessionKey);
        _register(bobKey, bobSessionKey);
        assertTrue(chat.canPost(btcRoom, alice)); // alice holds a BTC card
        assertFalse(chat.canPost(joeRoom, alice)); // but no JOE card
        assertFalse(chat.canPost(btcRoom, bob));

        _postFor(aliceSessionKey, btcRoom, "ciphertext", bytes32("a"));
        bytes memory bobSig = _postSig(bobSessionKey, btcRoom, "ciphertext", bytes32("b"));
        vm.expectRevert(abi.encodeWithSelector(CollectChat.NotAllowed.selector, btcRoom, bob));
        chat.postFor(btcRoom, "ciphertext", bytes32("b"), bobSig);

        // Card moves: access moves with it.
        vm.prank(alice);
        packs.transferFrom(alice, bob, aliceCard);
        assertTrue(chat.canPost(btcRoom, bob));
        assertFalse(chat.canPost(btcRoom, alice));
    }

    function test_postSignatureIsSingleUseAndBound() public {
        _register(aliceKey, aliceSessionKey);
        bytes memory sig =
            _sign(aliceSessionKey, _digest(keccak256(abi.encode(POST_TYPEHASH, lounge, keccak256("hi"), bytes32("s")))));
        chat.postFor(lounge, "hi", bytes32("s"), sig);
        vm.expectRevert(CollectChat.AlreadyPosted.selector);
        chat.postFor(lounge, "hi", bytes32("s"), sig);
        // Same signature can't be reused for a different body.
        vm.expectRevert(CollectChat.BadSignature.selector);
        chat.postFor(lounge, "edited", bytes32("s"), sig);
    }

    function test_registrationNeedsBothSignatures() public {
        address session = vm.addr(aliceSessionKey);
        uint64 expiry = uint64(vm.getBlockTimestamp() + 1 days);
        bytes32 chatKey = bytes32("k");
        // Bob tries to register alice's session key under his own wallet.
        bytes memory bobSig =
            _sign(bobKey, _digest(keccak256(abi.encode(REGISTER_TYPEHASH, bob, session, expiry, chatKey, uint256(0)))));
        bytes memory forged = _sign(bobKey, _digest(keccak256(abi.encode(SESSION_TYPEHASH, bob, expiry, uint256(0)))));
        vm.expectRevert(CollectChat.BadSignature.selector);
        chat.register(bob, session, expiry, chatKey, bobSig, forged);
    }

    function test_expiredSessionAndRevoke() public {
        _register(aliceKey, aliceSessionKey);
        vm.warp(vm.getBlockTimestamp() + 8 days);
        bytes memory late = _postSig(aliceSessionKey, lounge, "late", bytes32("1"));
        vm.expectRevert(abi.encodeWithSelector(CollectChat.SessionExpired.selector, vm.addr(aliceSessionKey)));
        chat.postFor(lounge, "late", bytes32("1"), late);

        _register(aliceKey, aliceSessionKey); // fresh session
        vm.prank(alice);
        chat.revoke(vm.addr(aliceSessionKey));
        bytes memory gone = _postSig(aliceSessionKey, lounge, "gone", bytes32("2"));
        vm.expectRevert(CollectChat.BadSignature.selector);
        chat.postFor(lounge, "gone", bytes32("2"), gone);
    }

    function test_directPostAndMute() public {
        _register(aliceKey, aliceSessionKey);
        vm.prank(alice);
        chat.post(lounge, "direct, own gas");

        vm.prank(alice);
        vm.expectRevert(CollectChat.NotModerator.selector);
        chat.setMuted(alice, true);
        vm.prank(owner);
        chat.setMuted(alice, true);
        assertFalse(chat.canPost(lounge, alice));
        bytes memory spam = _postSig(aliceSessionKey, lounge, "spam", bytes32("3"));
        vm.expectRevert(abi.encodeWithSelector(CollectChat.Muted.selector, alice));
        chat.postFor(lounge, "spam", bytes32("3"), spam);
    }

    function test_unregisteredCannotPost() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CollectChat.NotRegistered.selector, bob));
        chat.post(lounge, "hi");
    }

    function test_roomValidation() public {
        vm.startPrank(owner);
        vm.expectRevert(CollectChat.BadRoom.selector);
        chat.addRoom("", CollectChat.Gate.Open, address(0), 0, 0, false);
        vm.expectRevert(CollectChat.BadRoom.selector);
        chat.addRoom("$X", CollectChat.Gate.Card, address(0), 0, 1, true);
        vm.stopPrank();
    }

    // ---- names and profiles ----

    function test_namesAndCardAvatars() public {
        CollectNames names = new CollectNames();
        CollectProfiles profiles = new CollectProfiles(IERC721(address(packs)), IStakes(address(0)));

        vm.prank(alice);
        names.setName("alice_01");
        assertEq(names.ownerOf("alice_01"), alice);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CollectNames.NameTaken.selector, alice));
        names.setName("alice_01");

        vm.prank(alice);
        profiles.setAvatar(aliceCard, 5000, 5000, 100);
        (bool ok, address nft, uint256 tokenId,,,) = profiles.avatarOf(alice);
        assertTrue(ok);
        assertEq(nft, address(packs));
        assertEq(tokenId, aliceCard);
        // Avatar retires when the card leaves.
        vm.prank(alice);
        packs.transferFrom(alice, bob, aliceCard);
        (ok,,,,,) = profiles.avatarOf(alice);
        assertFalse(ok);
    }

    function test_anyNftAsAvatar() public {
        CollectProfiles profiles = new CollectProfiles(IERC721(address(packs)), IStakes(address(0)));
        SimpleNft apes = new SimpleNft();
        apes.mint(alice, 42);
        apes.mint(bob, 7);

        vm.prank(alice);
        profiles.setNftAvatar(address(apes), 42, 5000, 4000, 150);
        (bool ok, address nft, uint256 tokenId,, uint16 y, uint16 zoom) = profiles.avatarOf(alice);
        assertTrue(ok);
        assertEq(nft, address(apes));
        assertEq(tokenId, 42);
        assertEq(y, 4000);
        assertEq(zoom, 150);

        // Someone else's NFT is refused.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CollectProfiles.NotYourNft.selector, address(apes), 7));
        profiles.setNftAvatar(address(apes), 7, 5000, 5000, 100);

        // Not a contract at all.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CollectProfiles.NotYourNft.selector, address(0xBEEF), 1));
        profiles.setNftAvatar(address(0xBEEF), 1, 5000, 5000, 100);

        // Selling it retires the avatar.
        vm.prank(alice);
        apes.transferFrom(alice, bob, 42);
        (ok,,,,,) = profiles.avatarOf(alice);
        assertFalse(ok);

        // Passing the cards contract is the same as setAvatar.
        vm.prank(alice);
        profiles.setNftAvatar(address(packs), aliceCard, 5000, 5000, 100);
        (ok, nft,,,,) = profiles.avatarOf(alice);
        assertTrue(ok);
        assertEq(nft, address(packs));
    }

    function test_hostileNftCannotBreakReads() public {
        CollectProfiles profiles = new CollectProfiles(IERC721(address(packs)), IStakes(address(0)));
        GasBurnerNft burner = new GasBurnerNft();
        burner.setOwner(alice);
        vm.prank(alice);
        profiles.setNftAvatar(address(burner), 1, 5000, 5000, 100);
        burner.setBurn(true); // now ownerOf burns all gas it gets
        (bool ok,,,,,) = profiles.avatarOf(alice); // capped at 100k gas, returns cleanly
        assertFalse(ok);
    }
}

contract SimpleNft is ERC721 {
    constructor() ERC721("Apes", "APE") {}

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}

contract GasBurnerNft {
    address public holder;
    bool public burn;

    function setOwner(address a) external {
        holder = a;
    }

    function setBurn(bool b) external {
        burn = b;
    }

    function ownerOf(uint256) external view returns (address) {
        if (burn) {
            uint256 x;
            while (true) x++;
        }
        return holder;
    }
}
