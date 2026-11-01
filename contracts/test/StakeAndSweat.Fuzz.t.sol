// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {StakeAndSweat} from "../StakeAndSweat.sol";
import {StakeAndSweatTestBase} from "./StakeAndSweat.Base.t.sol";

contract StakeAndSweatFuzzTest is StakeAndSweatTestBase {
    /// PROPERTY: for any stake / participant count / completion pattern, total payouts
    /// (winner claims, or admin recovery when nobody completed) equal the pool exactly
    /// and the contract is left with zero balance.
    function testFuzz_PayoutsSumToPool_NoDustLeft(uint256 stake, uint256 nSeed, uint256 mask) public {
        stake = bound(stake, 1, 1e12);
        uint256 n = bound(nSeed, 1, 60);

        vm.prank(admin);
        uint256 id = sas.createChallenge("Fuzz", stake, joinDl, endT, verDl);

        address[] memory players = new address[](n);
        for (uint256 i; i < n; ++i) {
            address p = address(uint160(0x20000 + i));
            players[i] = p;
            usdc.mint(p, stake);
            vm.startPrank(p);
            usdc.approve(address(sas), stake);
            sas.join(id);
            vm.stopPrank();
        }
        uint256 pool = stake * n;
        assertEq(usdc.balanceOf(address(sas)), pool);

        vm.warp(endT);
        uint256 winners;
        address[] memory won = new address[](n);
        for (uint256 i; i < n; ++i) {
            if ((mask >> i) & 1 == 1) {
                won[winners++] = players[i];
            }
        }
        address[] memory winnerList = new address[](winners);
        for (uint256 i; i < winners; ++i) {
            winnerList[i] = won[i];
        }
        if (winners > 0) _set(id, winnerList, true);
        _finalizeAsAdmin(id);

        uint256 paid;
        address sink = makeAddr("sink");
        if (winners == 0) {
            vm.prank(admin);
            sas.recoverFunds(id, sink);
            paid = usdc.balanceOf(sink);
        } else {
            paid = _claimAll(id, winnerList, stake, n);
            // losers get nothing
            for (uint256 i; i < n; ++i) {
                if ((mask >> i) & 1 == 0) assertEq(usdc.balanceOf(players[i]), 0);
            }
        }
        assertEq(paid, pool);
        assertEq(usdc.balanceOf(address(sas)), 0);
    }

    function _claimAll(uint256 id, address[] memory winnerList, uint256 stake, uint256 n)
        internal
        returns (uint256 paid)
    {
        uint256 winners = winnerList.length;
        uint256 bonus = ((n - winners) * stake) / winners;
        for (uint256 i; i < winners; ++i) {
            address w = winnerList[i];
            uint256 pending = sas.pendingPayout(id, w);
            vm.prank(w);
            sas.claim(id);
            uint256 got = usdc.balanceOf(w);
            assertEq(got, pending);
            if (i < winners - 1) {
                assertEq(got, stake + bonus);
            } else {
                // last claimer: stake + bonus + remaining dust (< winners)
                assertLt(got - stake - bonus, winners);
            }
            paid += got;
        }
    }

    /// PROPERTY: cancelling returns every stake exactly and leaves nothing behind.
    function testFuzz_CancelRefundsEveryone(uint256 stake, uint256 nSeed) public {
        stake = bound(stake, 1, 1e12);
        uint256 n = bound(nSeed, 1, 40);
        vm.prank(admin);
        uint256 id = sas.createChallenge("Fuzz", stake, joinDl, endT, verDl);
        for (uint256 i; i < n; ++i) {
            address p = address(uint160(0x30000 + i));
            usdc.mint(p, stake);
            vm.startPrank(p);
            usdc.approve(address(sas), stake);
            sas.join(id);
            vm.stopPrank();
        }
        vm.prank(admin);
        sas.cancelChallenge(id);
        for (uint256 i; i < n; ++i) {
            address p = address(uint160(0x30000 + i));
            vm.prank(p);
            sas.refund(id);
            assertEq(usdc.balanceOf(p), stake);
        }
        assertEq(usdc.balanceOf(address(sas)), 0);
    }
}
