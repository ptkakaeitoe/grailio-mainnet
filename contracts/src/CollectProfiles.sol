// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
/// Optional staking contract: staked cards still count as yours.
interface IStakes {
    function stakes(uint256 tokenId) external view returns (address owner, uint64 since);
}

/// @notice Profiles for Grailio: a picture cropped from a card you own, a
/// short bio and social handles. The username lives in CollectNames; the app
/// joins the two.
/// @dev Ownership counts cards in your wallet, or staked for you if a staking
/// contract is set (address(0) at launch: no staking). It's checked when
/// you set the picture and again on every read, so selling or redeeming the
/// card quietly retires it.
///
/// Socials are stored as bare handles, never URLs, and checked against each
/// network's own handle rules. The app builds the link, so a profile can't
/// point anywhere but x.com, t.me or instagram.com.
contract CollectProfiles {
    uint16 public constant MIN_ZOOM = 100; // percent of the avatar's width
    uint16 public constant MAX_ZOOM = 400;
    uint16 public constant FULL = 10_000; // focus coordinates in basis points
    uint256 public constant MAX_BIO = 160; // bytes of UTF-8

    struct Avatar {
        address nft; // address(0) = a Collect card
        uint256 tokenId;
        uint16 x;
        uint16 y;
        uint16 zoom;
        bool set;
    }

    /// Handles without the @; "" means not set.
    struct Socials {
        string x; // 1–15: letters, digits, _
        string telegram; // 5–32: letters, digits, _
        string instagram; // 1–30: letters, digits, _ and .
    }

    IERC721 public immutable cards;
    IStakes public immutable staking;
    mapping(address account => Avatar) private _avatars;
    mapping(address account => string) public bioOf;
    mapping(address account => Socials) private _socials;

    error NotYourCard(uint256 tokenId);
    error NotYourNft(address nft, uint256 tokenId);
    error BadCrop();
    error BioTooLong(uint256 length);
    /// `network`: 0 X, 1 Telegram, 2 Instagram.
    error BadHandle(uint8 network);

    event AvatarSet(address indexed account, address indexed nft, uint256 indexed tokenId, uint16 x, uint16 y, uint16 zoom);
    event AvatarCleared(address indexed account);
    event BioSet(address indexed account, string bio);
    event SocialsSet(address indexed account, string x, string telegram, string instagram);

    constructor(IERC721 cards_, IStakes staking_) {
        cards = cards_;
        staking = staking_;
    }

    /// Uses one of your Grailio cards as your picture.
    function setAvatar(uint256 tokenId, uint16 x, uint16 y, uint16 zoom) external {
        if (x > FULL || y > FULL || zoom < MIN_ZOOM || zoom > MAX_ZOOM) revert BadCrop();
        if (!owns(msg.sender, tokenId)) revert NotYourCard(tokenId);
        _avatars[msg.sender] = Avatar(address(0), tokenId, x, y, zoom, true);
        emit AvatarSet(msg.sender, address(cards), tokenId, x, y, zoom);
    }

    /// Uses any ERC-721 you own on this chain as your picture. Checked again on every read.
    function setNftAvatar(address nft, uint256 tokenId, uint16 x, uint16 y, uint16 zoom) external {
        if (x > FULL || y > FULL || zoom < MIN_ZOOM || zoom > MAX_ZOOM) revert BadCrop();
        if (nft == address(cards) || nft == address(0)) {
            if (!owns(msg.sender, tokenId)) revert NotYourCard(tokenId);
            nft = address(0);
        } else if (!ownsNft(msg.sender, nft, tokenId)) {
            revert NotYourNft(nft, tokenId);
        }
        _avatars[msg.sender] = Avatar(nft, tokenId, x, y, zoom, true);
        emit AvatarSet(msg.sender, nft == address(0) ? address(cards) : nft, tokenId, x, y, zoom);
    }

    function clearAvatar() external {
        delete _avatars[msg.sender];
        emit AvatarCleared(msg.sender);
    }

    /// @notice Sets (or, with "", clears) your bio.
    function setBio(string calldata bio) public {
        if (bytes(bio).length > MAX_BIO) revert BioTooLong(bytes(bio).length);
        bioOf[msg.sender] = bio;
        emit BioSet(msg.sender, bio);
    }

    /// @notice Replaces all three handles; "" clears one.
    function setSocials(Socials calldata s) public {
        if (!validHandle(s.x, 1, 15, false)) revert BadHandle(0);
        if (!validHandle(s.telegram, 5, 32, false)) revert BadHandle(1);
        if (!validHandle(s.instagram, 1, 30, true)) revert BadHandle(2);
        _socials[msg.sender] = s;
        emit SocialsSet(msg.sender, s.x, s.telegram, s.instagram);
    }

    /// @notice Bio and socials in one transaction, for the profile editor.
    function setDetails(string calldata bio, Socials calldata s) external {
        setBio(bio);
        setSocials(s);
    }

    function socialsOf(address account) external view returns (Socials memory) {
        return _socials[account];
    }

    /// @notice The account's picture: which NFT (the Grailio cards contract for
    /// card avatars), token and crop. `ok` is false if unset or it has left them.
    function avatarOf(address account)
        public
        view
        returns (bool ok, address nft, uint256 tokenId, uint16 x, uint16 y, uint16 zoom)
    {
        Avatar memory a = _avatars[account];
        if (!a.set) return (false, address(0), 0, 0, 0, 0);
        bool held = a.nft == address(0) ? owns(account, a.tokenId) : ownsNft(account, a.nft, a.tokenId);
        if (!held) return (false, address(0), 0, 0, 0, 0);
        return (true, a.nft == address(0) ? address(cards) : a.nft, a.tokenId, a.x, a.y, a.zoom);
    }

    /// @notice Picture and bio in one read.
    function profileOf(address account)
        external
        view
        returns (bool ok, address nft, uint256 tokenId, uint16 x, uint16 y, uint16 zoom, string memory bio)
    {
        (ok, nft, tokenId, x, y, zoom) = avatarOf(account);
        bio = bioOf[account];
    }

    /// Whether `account` owns `tokenId` of an arbitrary ERC-721. Gas-capped and
    /// failure-tolerant, so a broken or hostile NFT contract can only blank the
    /// avatar of whoever chose it.
    function ownsNft(address account, address nft, uint256 tokenId) public view returns (bool) {
        if (nft.code.length == 0) return false;
        try IERC721(nft).ownerOf{gas: 100_000}(tokenId) returns (address holder) {
            return holder == account;
        } catch {
            return false;
        }
    }

    function owns(address account, uint256 tokenId) public view returns (bool) {
        try cards.ownerOf(tokenId) returns (address holder) {
            if (holder == account) return true;
            if (holder == address(staking)) {
                (address staker,) = staking.stakes(tokenId);
                return staker == account;
            }
            return false;
        } catch {
            return false; // burned (redeemed) or never minted
        }
    }

    /// Empty, or `min`–`max` of a–z, A–Z, 0–9 and _ (plus . when `dots`).
    function validHandle(string calldata handle, uint256 min, uint256 max, bool dots)
        public
        pure
        returns (bool)
    {
        bytes calldata b = bytes(handle);
        if (b.length == 0) return true;
        if (b.length < min || b.length > max) return false;
        for (uint256 i; i < b.length; ++i) {
            bytes1 c = b[i];
            bool ok = (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9")
                || c == "_" || (dots && c == ".");
            if (!ok) return false;
        }
        return true;
    }
}
