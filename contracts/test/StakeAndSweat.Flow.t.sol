// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {StakeAndSweat} from "../StakeAndSweat.sol";
import {StakeAndSweatTestBase} from "./StakeAndSweat.Base.t.sol";

contract StakeAndSweatFlowTest is StakeAndSweatTestBase {
    // ───────────── Happy paths ─────────────

    function test_HappyPath_WinnersClaimStakePlusEqualBonus_LastGetsDust() public {
        uint256 id = _fiveJoinedThreeComplete();
        assertEq(usdc.balanceOf(address(sas)), 5 * STAKE);
        assertEq(sas.poolOf(id), 5 * STAKE);

        _finalizeAsAdmin(id);
        StakeAndSweat.Challenge memory c = sas.getChallenge(id);
        assertEq(uint8(c.status), uint8(StakeAndSweat.Status.Finalized));
        assertEq(c.completedCount, 3);
        assertEq(c.failedPool, 2 * STAKE);
        assertEq(c.bonusPerWinner, 6_666_666);

        uint256 normal = STAKE + 6_666_666;
        assertEq(sas.pendingPayout(id, alice), normal);
        assertEq(sas.pendingPayout(id, dave), 0);

        vm.expectEmit(true, true, false, true, address(sas));
        emit StakeAndSweat.Claimed(id, alice, normal);
        vm.prank(alice);
        sas.claim(id);
        vm.prank(bob);
        sas.claim(id);
        assertEq(usdc.balanceOf(alice), normal);
        assertEq(usdc.balanceOf(bob), normal);

        // last claimer receives the 2-unit rounding dust
        assertEq(sas.pendingPayout(id, carol), normal + 2);
        vm.prank(carol);
        sas.claim(id);
        assertEq(usdc.balanceOf(carol), normal + 2);

        assertEq(usdc.balanceOf(address(sas)), 0);
        assertEq(usdc.balanceOf(dave), 0);
        assertEq(usdc.balanceOf(erin), 0);
        assertEq(usdc.balanceOf(alice) + usdc.balanceOf(bob) + usdc.balanceOf(carol), 5 * STAKE);
    }

    function test_AllComplete_BonusZero_EachGetsStakeBack() public {
        uint256 id = _create();
        _join(id, alice);
        _join(id, bob);
        _join(id, carol);
        vm.warp(endT);
        _set(id, _three(alice, bob, carol), true);
        _finalizeAsAdmin(id);

        StakeAndSweat.Challenge memory c = sas.getChallenge(id);
        assertEq(c.bonusPerWinner, 0);
        assertEq(c.failedPool, 0);
        vm.prank(alice);
        sas.claim(id);
        vm.prank(bob);
        sas.claim(id);
        vm.prank(carol);
        sas.claim(id);
        assertEq(usdc.balanceOf(alice), STAKE);
        assertEq(usdc.balanceOf(bob), STAKE);
        assertEq(usdc.balanceOf(carol), STAKE);
        assertEq(usdc.balanceOf(address(sas)), 0);
    }

    function test_SingleWinnerTakesWholePool() public {
        uint256 id = _create();
        _join(id, alice);
        _join(id, bob);
        _join(id, carol);
        vm.warp(endT);
        _set(id, _one(bob), true);
        _finalizeAsAdmin(id);
        vm.prank(bob);
        sas.claim(id);
        assertEq(usdc.balanceOf(bob), 3 * STAKE);
        assertEq(usdc.balanceOf(address(sas)), 0);
    }

    // ───────────── recoverFunds ─────────────

    function test_NobodyCompletes_AdminRecoversWholePool_NotTwice() public {
        uint256 id = _create();
        _join(id, alice);
        _join(id, bob);
        _join(id, carol);
        vm.warp(endT);
        _finalizeAsAdmin(id);

        address treasury = makeAddr("treasury");
        vm.expectEmit(true, true, false, true, address(sas));
        emit StakeAndSweat.FundsRecovered(id, treasury, 3 * STAKE);
        vm.prank(admin);
        sas.recoverFunds(id, treasury);
        assertEq(usdc.balanceOf(treasury), 3 * STAKE);
        assertEq(usdc.balanceOf(address(sas)), 0);
        assertTrue(sas.getChallenge(id).fundsRecovered);

        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.RecoveryNotAllowed.selector);
        sas.recoverFunds(id, treasury);
    }

    function test_RecoverFunds_BlockedWhenSomeoneCompleted() public {
        uint256 id = _fiveJoinedThreeComplete();
        _finalizeAsAdmin(id);
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.RecoveryNotAllowed.selector);
        sas.recoverFunds(id, admin);
    }

    function test_RecoverFunds_RevertsForNonOwner() public {
        uint256 id = _create();
        _join(id, alice);
        vm.warp(endT);
        _finalizeAsAdmin(id);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        sas.recoverFunds(id, stranger);
    }

    function test_RecoverFunds_RevertsBeforeFinalize() public {
        uint256 id = _create();
        _join(id, alice);
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                StakeAndSweat.WrongStatus.selector, StakeAndSweat.Status.Finalized, StakeAndSweat.Status.Active
            )
        );
        sas.recoverFunds(id, admin);
    }

    function test_RecoverFunds_RevertsZeroRecipient() public {
        uint256 id = _create();
        _join(id, alice);
        vm.warp(endT);
        _finalizeAsAdmin(id);
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.ZeroAddress.selector);
        sas.recoverFunds(id, address(0));
    }

    function test_RecoverFunds_RevertsWithNoParticipants() public {
        uint256 id = _create();
        vm.warp(endT);
        _finalizeAsAdmin(id);
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.RecoveryNotAllowed.selector);
        sas.recoverFunds(id, admin);
    }

    // ───────────── join ─────────────

    function test_Join_TakesStakeAndEmits() public {
        uint256 id = _create();
        usdc.mint(alice, STAKE);
        vm.startPrank(alice);
        usdc.approve(address(sas), STAKE);
        vm.expectEmit(true, true, false, false, address(sas));
        emit StakeAndSweat.Joined(id, alice);
        sas.join(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(sas)), STAKE);
        assertEq(usdc.balanceOf(alice), 0);
        assertTrue(sas.getEntry(id, alice).joined);
        assertEq(sas.getChallenge(id).participantCount, 1);
    }

    function test_Join_RevertsAfterDeadline() public {
        uint256 id = _create();
        vm.warp(joinDl);
        usdc.mint(alice, STAKE);
        vm.startPrank(alice);
        usdc.approve(address(sas), STAKE);
        vm.expectRevert(StakeAndSweat.JoiningClosed.selector);
        sas.join(id);
        vm.stopPrank();
    }

    function test_Join_LastSecondBeforeDeadlineWorks() public {
        uint256 id = _create();
        vm.warp(joinDl - 1);
        _join(id, alice);
        assertTrue(sas.getEntry(id, alice).joined);
    }

    function test_Join_RevertsDoubleJoin() public {
        uint256 id = _create();
        _join(id, alice);
        usdc.mint(alice, STAKE);
        vm.startPrank(alice);
        usdc.approve(address(sas), STAKE);
        vm.expectRevert(StakeAndSweat.AlreadyJoined.selector);
        sas.join(id);
        vm.stopPrank();
    }

    function test_Join_AdminCannotJoin() public {
        uint256 id = _create();
        usdc.mint(admin, STAKE);
        vm.startPrank(admin);
        usdc.approve(address(sas), STAKE);
        vm.expectRevert(StakeAndSweat.AdminCannotJoin.selector);
        sas.join(id);
        vm.stopPrank();
    }

    function test_Join_RevertsInvalidChallenge() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StakeAndSweat.InvalidChallenge.selector, 0));
        sas.join(0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StakeAndSweat.InvalidChallenge.selector, 1));
        sas.join(1);
    }

    function test_Join_RevertsWithoutAllowance() public {
        uint256 id = _create();
        usdc.mint(alice, STAKE);
        vm.prank(alice);
        vm.expectRevert();
        sas.join(id);
    }

    function test_Join_RevertsWhenTokenDeliversLessThanStake() public {
        uint256 id = _create();
        usdc.setShortChange(true);
        usdc.mint(alice, STAKE);
        vm.startPrank(alice);
        usdc.approve(address(sas), STAKE);
        vm.expectRevert(StakeAndSweat.IncorrectStakeReceived.selector);
        sas.join(id);
        vm.stopPrank();
    }

    function test_Join_ParticipantLimit() public {
        uint256 id = _create();
        uint256 max = sas.MAX_PARTICIPANTS();
        for (uint256 i; i < max; ++i) {
            _join(id, address(uint160(0x10000 + i)));
        }
        assertEq(sas.getChallenge(id).participantCount, max);
        usdc.mint(alice, STAKE);
        vm.startPrank(alice);
        usdc.approve(address(sas), STAKE);
        vm.expectRevert(StakeAndSweat.ParticipantLimitReached.selector);
        sas.join(id);
        vm.stopPrank();
    }

    // ───────────── setCompletions ─────────────

    function test_SetCompletions_SetsFlagsAndEmits() public {
        uint256 id = _create();
        _join(id, alice);
        vm.warp(endT);
        vm.expectEmit(true, true, false, true, address(sas));
        emit StakeAndSweat.Verified(id, alice, true);
        _set(id, _one(alice), true);
        assertTrue(sas.getEntry(id, alice).completed);
        assertEq(sas.getChallenge(id).completedCount, 1);
    }

    function test_SetCompletions_RevertsBeforeEndTime() public {
        uint256 id = _create();
        _join(id, alice);
        vm.warp(endT - 1);
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.VerificationNotStarted.selector);
        sas.setCompletions(id, _one(alice), true);
    }

    function test_SetCompletions_AllowedAtVerifyDeadline_RevertsAfter() public {
        uint256 id = _create();
        _join(id, alice);
        vm.warp(verDl);
        _set(id, _one(alice), true);
        assertEq(sas.getChallenge(id).completedCount, 1);
        vm.warp(verDl + 1);
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.VerificationClosed.selector);
        sas.setCompletions(id, _one(alice), false);
    }

    function test_SetCompletions_RevertsForNonJoined() public {
        uint256 id = _create();
        _join(id, alice);
        vm.warp(endT);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(StakeAndSweat.NotJoined.selector, stranger));
        sas.setCompletions(id, _two(alice, stranger), true);
    }

    function test_SetCompletions_RevertsForNonOwner() public {
        uint256 id = _create();
        _join(id, alice);
        vm.warp(endT);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        sas.setCompletions(id, _one(alice), true);
    }

    function test_SetCompletions_RevertsBatchTooLarge() public {
        uint256 id = _create();
        vm.warp(endT);
        address[] memory big = new address[](101);
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.VerificationBatchTooLarge.selector);
        sas.setCompletions(id, big, true);
    }

    function test_SetCompletions_RevertsAfterFinalize() public {
        uint256 id = _create();
        _join(id, alice);
        vm.warp(endT);
        _finalizeAsAdmin(id);
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                StakeAndSweat.WrongStatus.selector, StakeAndSweat.Status.Active, StakeAndSweat.Status.Finalized
            )
        );
        sas.setCompletions(id, _one(alice), true);
    }

    function test_SetCompletions_ToggleIdempotent() public {
        uint256 id = _create();
        _join(id, alice);
        _join(id, bob);
        vm.warp(endT);
        _set(id, _two(alice, bob), true);
        _set(id, _two(alice, bob), true); // repeat: no double count
        assertEq(sas.getChallenge(id).completedCount, 2);
        _set(id, _one(alice), false);
        _set(id, _one(alice), false); // repeat: no underflow / double decrement
        assertEq(sas.getChallenge(id).completedCount, 1);
        assertFalse(sas.getEntry(id, alice).completed);
        assertTrue(sas.getEntry(id, bob).completed);
        // duplicates inside one batch also count once
        _set(id, _two(alice, alice), true);
        assertEq(sas.getChallenge(id).completedCount, 2);
    }

    // ───────────── finalize ─────────────

    function test_Finalize_OwnerAfterEndTime() public {
        uint256 id = _fiveJoinedThreeComplete();
        vm.expectEmit(true, false, false, true, address(sas));
        emit StakeAndSweat.Finalized(id, 3, 2 * STAKE, 6_666_666);
        _finalizeAsAdmin(id);
    }

    function test_Finalize_OwnerBeforeEndTimeReverts() public {
        uint256 id = _create();
        vm.warp(endT - 1);
        vm.prank(admin);
        vm.expectRevert(StakeAndSweat.FinalizationNotAllowed.selector);
        sas.finalize(id);
    }

    function test_Finalize_NonOwnerOnlyAfterVerifyDeadline() public {
        uint256 id = _create();
        _join(id, alice);
        vm.warp(endT);
        vm.prank(stranger);
        vm.expectRevert(StakeAndSweat.FinalizationNotAllowed.selector);
        sas.finalize(id);
        vm.warp(verDl); // inclusive boundary still blocked
        vm.prank(stranger);
        vm.expectRevert(StakeAndSweat.FinalizationNotAllowed.selector);
        sas.finalize(id);
        vm.warp(verDl + 1);
        vm.prank(stranger);
        sas.finalize(id);
        assertEq(uint8(sas.getChallenge(id).status), uint8(StakeAndSweat.Status.Finalized));
    }

    function test_Finalize_OwnerAfterVerifyDeadlineWorks() public {
        uint256 id = _create();
        vm.warp(verDl + 10);
        _finalizeAsAdmin(id);
        assertEq(uint8(sas.getChallenge(id).status), uint8(StakeAndSweat.Status.Finalized));
    }

    function test_Finalize_TwiceReverts() public {
        uint256 id = _create();
        vm.warp(endT);
        _finalizeAsAdmin(id);
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                StakeAndSweat.WrongStatus.selector, StakeAndSweat.Status.Active, StakeAndSweat.Status.Finalized
            )
        );
        sas.finalize(id);
    }

    // ───────────── claim ─────────────

    function test_Claim_NonWinnerReverts() public {
        uint256 id = _fiveJoinedThreeComplete();
        _finalizeAsAdmin(id);
        vm.prank(dave);
        vm.expectRevert(StakeAndSweat.NotCompleted.selector);
        sas.claim(id);
    }

    function test_Claim_NonParticipantReverts() public {
        uint256 id = _fiveJoinedThreeComplete();
        _finalizeAsAdmin(id);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(StakeAndSweat.NotJoined.selector, stranger));
        sas.claim(id);
    }

    function test_Claim_TwiceReverts() public {
        uint256 id = _fiveJoinedThreeComplete();
        _finalizeAsAdmin(id);
        vm.prank(alice);
        sas.claim(id);
        vm.prank(alice);
        vm.expectRevert(StakeAndSweat.AlreadySettled.selector);
        sas.claim(id);
        assertEq(sas.pendingPayout(id, alice), 0);
    }

    function test_Claim_BeforeFinalizeReverts() public {
        uint256 id = _fiveJoinedThreeComplete();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                StakeAndSweat.WrongStatus.selector, StakeAndSweat.Status.Finalized, StakeAndSweat.Status.Active
            )
        );
        sas.claim(id);
    }
}
