// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {StakeAndSweat} from "../StakeAndSweat.sol";
import {StakeAndSweatTestBase} from "./StakeAndSweat.Base.t.sol";

contract StakeAndSweatAdminTest is StakeAndSweatTestBase {
    // ───────────── constructor ─────────────

    function test_Constructor_SetsTokenAndOwner() public view {
        assertEq(address(sas.usdc()), address(usdc));
        assertEq(sas.owner(), admin);
        assertEq(sas.challengeCount(), 0);
    }

    function test_Constructor_RevertsZeroToken() public {
        vm.expectRevert(StakeAndSweat.ZeroAddress.selector);
        new StakeAndSweat(address(0), admin);
    }

    function test_Constructor_RevertsZeroAdmin() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new StakeAndSweat(address(usdc), address(0));
    }

    // ───────────── createChallenge ─────────────

    function test_CreateChallenge_StoresAndEmits() public {
        vm.expectEmit(true, false, false, true, address(sas));
        emit StakeAndSweat.ChallengeCreated(1, "Run 5k", STAKE, joinDl, endT, verDl);
        uint256 id = _create();
        assertEq(id, 1);
        assertEq(sas.challengeCount(), 1);
        StakeAndSweat.Challenge memory c = sas.getChallenge(id);
        assertEq(c.title, "Run 5k");
        assertEq(c.stake, STAKE);
        assertEq(c.joinDeadline, joinDl);
        assertEq(c.endTime, endT);
        assertEq(c.verifyDeadline, verDl);
        assertEq(uint8(c.status), uint8(StakeAndSweat.Status.Active));
        assertEq(_create(), 2);
    }

    function test_CreateChallenge_RevertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        sas.createChallenge("x", STAKE, joinDl, endT, verDl);
    }

    function test_CreateChallenge_RevertsZeroStake() public {
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.InvalidStake.selector);
        sas.createChallenge("x", 0, joinDl, endT, verDl);
    }

    function test_CreateChallenge_TitleBounds() public {
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.InvalidTitle.selector);
        sas.createChallenge("", STAKE, joinDl, endT, verDl);

        string memory t80 = new string(80);
        string memory t81 = new string(81);
        vm.prank(admin);
        sas.createChallenge(t80, STAKE, joinDl, endT, verDl);
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.InvalidTitle.selector);
        sas.createChallenge(t81, STAKE, joinDl, endT, verDl);
    }

    function test_CreateChallenge_DeadlineValidation() public {
        // joinDeadline not in the future
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.InvalidDeadlines.selector);
        sas.createChallenge("x", STAKE, uint64(block.timestamp), endT, verDl);
        // joinDeadline after endTime
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.InvalidDeadlines.selector);
        sas.createChallenge("x", STAKE, endT + 1, endT, verDl);
        // endTime == verifyDeadline
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.InvalidDeadlines.selector);
        sas.createChallenge("x", STAKE, joinDl, verDl, verDl);
        // endTime after verifyDeadline
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.InvalidDeadlines.selector);
        sas.createChallenge("x", STAKE, joinDl, verDl + 1, verDl);
        // joinDeadline == endTime is allowed
        vm.prank(admin);
        sas.createChallenge("x", STAKE, endT, endT, verDl);
    }

    // ───────────── cancel / refund ─────────────

    function test_Cancel_ThenRefundOnce() public {
        uint256 id = _create();
        _join(id, alice);
        _join(id, bob);

        vm.expectEmit(true, false, false, false, address(sas));
        emit StakeAndSweat.Cancelled(id);
        vm.prank(admin);
        sas.cancelChallenge(id);
        assertEq(uint8(sas.getChallenge(id).status), uint8(StakeAndSweat.Status.Cancelled));

        vm.expectEmit(true, true, false, true, address(sas));
        emit StakeAndSweat.Refunded(id, alice, STAKE);
        vm.prank(alice);
        sas.refund(id);
        assertEq(usdc.balanceOf(alice), STAKE);

        vm.prank(alice);
        vm.expectRevert(StakeAndSweat.AlreadySettled.selector);
        sas.refund(id);

        vm.prank(bob);
        sas.refund(id);
        assertEq(usdc.balanceOf(bob), STAKE);
        assertEq(usdc.balanceOf(address(sas)), 0);
    }

    function test_Cancel_RefundByNonParticipantReverts() public {
        uint256 id = _create();
        _join(id, alice);
        vm.prank(admin);
        sas.cancelChallenge(id);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(StakeAndSweat.NotJoined.selector, stranger));
        sas.refund(id);
    }

    function test_Cancel_AtOrAfterEndTimeReverts() public {
        uint256 id = _create();
        vm.warp(endT);
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.CancellationClosed.selector);
        sas.cancelChallenge(id);
        vm.warp(endT + 1 days);
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.CancellationClosed.selector);
        sas.cancelChallenge(id);
    }

    function test_Cancel_JustBeforeEndTimeWorks() public {
        uint256 id = _create();
        vm.warp(endT - 1);
        vm.prank(admin);
        sas.cancelChallenge(id);
        assertEq(uint8(sas.getChallenge(id).status), uint8(StakeAndSweat.Status.Cancelled));
    }

    function test_Cancel_RevertsForNonOwner() public {
        uint256 id = _create();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        sas.cancelChallenge(id);
    }

    function test_Cancel_TwiceReverts() public {
        uint256 id = _create();
        vm.startPrank(admin);
        sas.cancelChallenge(id);
        vm.expectRevert(
            abi.encodeWithSelector(
                StakeAndSweat.WrongStatus.selector, StakeAndSweat.Status.Active, StakeAndSweat.Status.Cancelled
            )
        );
        sas.cancelChallenge(id);
        vm.stopPrank();
    }

    function test_Refund_RevertsWhenNotCancelled() public {
        uint256 id = _create();
        _join(id, alice);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                StakeAndSweat.WrongStatus.selector, StakeAndSweat.Status.Cancelled, StakeAndSweat.Status.Active
            )
        );
        sas.refund(id);
    }

    function test_Cancelled_JoinAndFinalizeRevert() public {
        uint256 id = _create();
        vm.prank(admin);
        sas.cancelChallenge(id);
        usdc.mint(alice, STAKE);
        vm.startPrank(alice);
        usdc.approve(address(sas), STAKE);
        vm.expectRevert(
            abi.encodeWithSelector(
                StakeAndSweat.WrongStatus.selector, StakeAndSweat.Status.Active, StakeAndSweat.Status.Cancelled
            )
        );
        sas.join(id);
        vm.stopPrank();

        vm.warp(verDl + 1);
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                StakeAndSweat.WrongStatus.selector, StakeAndSweat.Status.Active, StakeAndSweat.Status.Cancelled
            )
        );
        sas.finalize(id);
    }

    // ───────────── ownership ─────────────

    function test_RenounceOwnership_Reverts() public {
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.OwnershipRenunciationDisabled.selector);
        sas.renounceOwnership();
        assertEq(sas.owner(), admin);
    }

    function test_RenounceOwnership_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        sas.renounceOwnership();
    }

    function test_Ownable2Step_TransferAndAccept() public {
        vm.prank(admin);
        sas.transferOwnership(alice);
        assertEq(sas.owner(), admin);
        assertEq(sas.pendingOwner(), alice);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        sas.acceptOwnership();

        vm.expectEmit(true, true, false, false, address(sas));
        emit Ownable.OwnershipTransferred(admin, alice);
        vm.prank(alice);
        sas.acceptOwnership();
        assertEq(sas.owner(), alice);
        assertEq(sas.pendingOwner(), address(0));

        // old owner loses powers, new owner has them
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, admin));
        sas.createChallenge("x", STAKE, joinDl, endT, verDl);
        vm.prank(alice);
        sas.createChallenge("x", STAKE, joinDl, endT, verDl);
    }

    function test_Ownable2Step_OnlyOwnerCanStartTransfer() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        sas.transferOwnership(alice);
    }

    // ───────────── views ─────────────

    function test_Views_InvalidIdReverts() public {
        vm.expectRevert(abi.encodeWithSelector(StakeAndSweat.InvalidChallenge.selector, 1));
        sas.getChallenge(1);
        vm.expectRevert(abi.encodeWithSelector(StakeAndSweat.InvalidChallenge.selector, 0));
        sas.poolOf(0);
        vm.expectRevert(abi.encodeWithSelector(StakeAndSweat.InvalidChallenge.selector, 5));
        sas.getEntry(5, alice);
        vm.expectRevert(abi.encodeWithSelector(StakeAndSweat.InvalidChallenge.selector, 5));
        sas.getParticipants(5, 0, 1);
        vm.expectRevert(abi.encodeWithSelector(StakeAndSweat.InvalidChallenge.selector, 5));
        sas.pendingPayout(5, alice);
    }

    function test_GetParticipants_Paging() public {
        uint256 id = _create();
        _join(id, alice);
        _join(id, bob);
        _join(id, carol);
        address[] memory all = sas.getParticipants(id, 0, 10);
        assertEq(all.length, 3);
        assertEq(all[0], alice);
        assertEq(all[2], carol);
        address[] memory page = sas.getParticipants(id, 1, 1);
        assertEq(page.length, 1);
        assertEq(page[0], bob);
        assertEq(sas.getParticipants(id, 2, 10).length, 1);
        assertEq(sas.getParticipants(id, 3, 10).length, 0);
        assertEq(sas.getParticipants(id, 99, 10).length, 0);
    }

    function test_PendingPayout_ZeroBeforeFinalize() public {
        uint256 id = _fiveJoinedThreeComplete();
        assertEq(sas.pendingPayout(id, alice), 0);
    }
}
