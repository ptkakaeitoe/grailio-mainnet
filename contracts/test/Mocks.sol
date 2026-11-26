// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter02, IV2Router} from "../src/CollectPacks.sol";

contract MockToken is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory symbol, uint8 decimals_) ERC20(symbol, symbol) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockFeed {
    int256 public answer;
    uint256 public updatedAt;

    constructor(int256 answer_) {
        answer = answer_;
        updatedAt = block.timestamp;
    }

    function set(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

/// Swaps USDC for the path's last token at a set price (USD per whole token, 8 decimals),
/// minus `haircutBps`. Can be told to fail.
contract MockRouter {
    IERC20 public immutable usdc;
    mapping(address token => uint256) public price8;
    mapping(address token => uint8) public decimalsOf;
    uint256 public haircutBps;
    bool public broken;

    constructor(IERC20 usdc_) {
        usdc = usdc_;
    }

    function setPrice(address token, uint256 p, uint8 d) external {
        price8[token] = p;
        decimalsOf[token] = d;
    }

    function setHaircut(uint256 bps) external {
        haircutBps = bps;
    }

    function setBroken(bool b) external {
        broken = b;
    }

    function _swap(address token, uint256 amountIn, uint256 minOut, address to) private returns (uint256 out) {
        require(!broken, "broken");
        usdc.transferFrom(msg.sender, address(this), amountIn);
        // tokens = (amountIn / 10^usdcDec) / (price8 / 1e8) * 10^tokenDec
        uint256 usdcDec = MockToken(address(usdc)).decimals();
        out = amountIn * 10 ** (decimalsOf[token] + 8) / (price8[token] * 10 ** usdcDec);
        out = out * (10_000 - haircutBps) / 10_000;
        require(out >= minOut, "slippage");
        MockToken(token).mint(to, out);
    }

    function exactInput(ISwapRouter02.ExactInputParams calldata p) external payable returns (uint256) {
        address token = address(bytes20(p.path[p.path.length - 20:]));
        return _swap(token, p.amountIn, p.amountOutMinimum, p.recipient);
    }

    function swapExactTokensForTokens(uint256 amountIn, uint256 minOut, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
        amounts[path.length - 1] = _swap(path[path.length - 1], amountIn, minOut, to);
    }
}
