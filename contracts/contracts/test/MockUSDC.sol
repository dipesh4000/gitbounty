// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    bool public transfersBlocked;
    uint256 public feeBps;

    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function setTransfersBlocked(bool blocked) external {
        transfersBlocked = blocked;
    }

    function setFeeBps(uint256 feeBps_) external {
        feeBps = feeBps_;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (transfersBlocked && from != address(0) && to != address(0)) revert("transfers blocked");

        uint256 fee = from != address(0) && to != address(0) ? amount * feeBps / 10_000 : 0;
        if (fee != 0) super._update(from, address(0), fee);
        super._update(from, to, amount - fee);
    }
}
