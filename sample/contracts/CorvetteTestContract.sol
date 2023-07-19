// SPDX-License-Identifier: LGPL-2.1-or-later
pragma solidity ^0.8.18;

contract CorvetteTestContract {

    uint256 private ordinal = 0;
    event OrdinaryEvent(bytes32 psuedoRandom, uint256 indexed ordinal, int8 indexed constantParam, CorvetteTestContract thisAddress, bool isPsuedoRandomEven, address proposer, uint256 proposerBalance, address payable indexed caller, uint256 callerBalance);
    event EdgeCaseEvent(bytes32 hasName, uint256 indexed hasNameIndexed, int8 indexed, CorvetteTestContract, bool boolean, address proposer, uint256 proposerBalance, address payable indexed caller, uint256 callerBalance);

    function EmitOrdinary() public {
        bytes32 psuedoRandom = rand();
        emit OrdinaryEvent(
            psuedoRandom,
            ordinal++,
            42,
            this,
            uint256(psuedoRandom) % 2 == 0,
            block.coinbase,
            block.coinbase.balance,
            payable(msg.sender),
            msg.sender.balance);
    }

    function EmitEdgeCase() public {
        bytes32 psuedoRandom = rand();
        emit EdgeCaseEvent(
            psuedoRandom,
            ordinal++,
            42,
            this,
            uint256(psuedoRandom) % 2 == 0,
            block.coinbase,
            block.coinbase.balance,
            payable(msg.sender),
            msg.sender.balance);
    }

    function rand() private view returns(bytes32) {
        return keccak256(abi.encodePacked(
            block.timestamp + block.prevrandao +
            ((uint256(keccak256(abi.encodePacked(block.coinbase)))) / (block.timestamp)) +
            block.gaslimit + 
            ((uint256(keccak256(abi.encodePacked(msg.sender)))) / (block.timestamp)) +
            block.number
        ));
    }
}
