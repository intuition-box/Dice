pragma solidity >=0.8.0 <0.9.0; //Do not change the solidity version as it negatively impacts submission grading
//SPDX-License-Identifier: MIT

import "hardhat/console.sol";

contract DiceGame {
    uint256 public nonce = 0;

    error NotEnoughEther();

    event Roll(address indexed player, uint256 amount, uint256 roll);
    event Winner(address winner, uint256 amount);

    constructor() payable {
        // No prize initialization needed - fixed 6x payout
    }

    function rollTheDice() public payable {
        if (msg.value < 0.002 ether) {
            revert NotEnoughEther();
        }

        bytes32 prevHash = blockhash(block.number - 1);
        bytes32 hash = keccak256(abi.encodePacked(prevHash, address(this), nonce));
        uint256 roll = (uint256(hash) % 6) + 1; // Roll between 1-6

        console.log("\t", "   Dice Game Roll:", roll);

        nonce++;

        emit Roll(msg.sender, msg.value, roll);

        // Only 3 is a winning number
        if (roll == 3) {
            // Winner gets 6x their bet
            uint256 amount = msg.value * 6;
            (bool sent, ) = msg.sender.call{ value: amount }("");
            require(sent, "Failed to send Ether");

            emit Winner(msg.sender, amount);
        }
        // All other numbers (1, 2, 4, 5, 6) are losses - no payout
    }

    receive() external payable {}
}
