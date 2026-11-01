// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StakeAndSweat} from "../StakeAndSweat.sol";
import {MockUSDC, StakeAndSweatTestBase} from "./StakeAndSweat.Base.t.sol";

contract StakeAndSweatHandler is Test {
    StakeAndSweat public sas;
    MockUSDC public usdc;
    address public admin;
    uint256 public id;
    uint256 public stake;
    uint64 public joinDl;
    uint64 public endT;
    uint64 public verDl;
    address[] public actors;
    uint256 public paid;

    constructor(StakeAndSweat _sas, MockUSDC _usdc, address _admin, uint256 _id, uint256 _stake) {
        sas = _sas;
        usdc = _usdc;
        admin = _admin;
        id = _id;
        stake = _stake;
        StakeAndSweat.Challenge memory c = _sas.getChallenge(_id);
        joinDl = c.joinDeadline;
        endT = c.endTime;
        verDl = c.verifyDeadline;
        for (uint256 i; i < 8; ++i) {
            actors.push(address(uint160(0x40000 + i)));
        }
    }

    function _actor(uint256 s) internal view returns (address) {
        return actors[s % actors.length];
    }

    function _status() internal view returns (StakeAndSweat.Status) {
        return sas.getChallenge(id).status;
    }

    function join(uint256 s) external {
        address p = _actor(s);
        if (block.timestamp >= joinDl || sas.getEntry(id, p).joined) return;
        usdc.mint(p, stake);
        vm.startPrank(p);
        usdc.approve(address(sas), stake);
        sas.join(id);
        vm.stopPrank();
    }

    function advanceToEnd() external {
        if (block.timestamp < endT) vm.warp(endT);
    }

    function verify(uint256 s, bool done) external {
        address p = _actor(s);
        if (_status() != StakeAndSweat.Status.Active) return;
        if (block.timestamp < endT || block.timestamp > verDl) return;
        if (!sas.getEntry(id, p).joined) return;
        address[] memory one = new address[](1);
        one[0] = p;
        vm.prank(admin);
        sas.setCompletions(id, one, done);
    }

    function finalize() external {
        if (_status() != StakeAndSweat.Status.Active || block.timestamp < endT) return;
        vm.prank(admin);
        sas.finalize(id);
    }

    function claim(uint256 s) external {
        address p = _actor(s);
        uint256 amt = sas.pendingPayout(id, p);
        if (amt == 0) return;
        vm.prank(p);
        sas.claim(id);
        paid += amt;
    }

    function recover() external {
        StakeAndSweat.Challenge memory c = sas.getChallenge(id);
        if (c.status != StakeAndSweat.Status.Finalized) return;
        if (c.completedCount != 0 || c.participantCount == 0 || c.fundsRecovered) return;
        vm.prank(admin);
        sas.recoverFunds(id, admin);
        paid += c.stake * c.participantCount;
    }
}

contract StakeAndSweatInvariantTest is StakeAndSweatTestBase {
    StakeAndSweatHandler internal handler;
    uint256 internal cid;

    function setUp() public override {
        super.setUp();
        cid = _create();
        handler = new StakeAndSweatHandler(sas, usdc, admin, cid, STAKE);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = StakeAndSweatHandler.join.selector;
        selectors[1] = StakeAndSweatHandler.advanceToEnd.selector;
        selectors[2] = StakeAndSweatHandler.verify.selector;
        selectors[3] = StakeAndSweatHandler.finalize.selector;
        selectors[4] = StakeAndSweatHandler.claim.selector;
        selectors[5] = StakeAndSweatHandler.recover.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// Conservation: contract balance == total staked minus everything paid out.
    function invariant_BalanceEqualsPoolMinusPaid() public view {
        assertEq(usdc.balanceOf(address(sas)), sas.poolOf(cid) - handler.paid());
    }

    /// Once every winner has claimed (or funds were recovered), nothing is left behind.
    function invariant_NoDustAfterSettlement() public view {
        StakeAndSweat.Challenge memory c = sas.getChallenge(cid);
        if (c.status != StakeAndSweat.Status.Finalized) return;
        if (c.completedCount > 0 && c.claimedCount == c.completedCount) {
            assertEq(usdc.balanceOf(address(sas)), 0);
        }
        if (c.completedCount == 0 && c.fundsRecovered) {
            assertEq(usdc.balanceOf(address(sas)), 0);
        }
    }
}
