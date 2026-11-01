// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Stake & Sweat
/// @notice Habit challenges funded in the configured USDC token's smallest units.
/// @dev The owner verifies outcomes and may finalize early once a challenge ends.
contract StakeAndSweat is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { Active, Finalized, Cancelled }

    struct Challenge {
        string title;
        uint256 stake;
        uint64 joinDeadline;
        uint64 endTime;
        uint64 verifyDeadline;
        Status status;
        uint32 participantCount;
        uint32 completedCount;
        uint32 claimedCount;
        bool fundsRecovered;
        uint256 bonusPerWinner;
        uint256 failedPool;
    }

    struct Entry {
        bool joined;
        bool completed;
        bool settled;
    }

    IERC20 public immutable usdc;
    uint256 public constant MAX_PARTICIPANTS = 500;
    uint256 public constant MAX_VERIFICATIONS = 100;
    uint256 public challengeCount;

    mapping(uint256 => Challenge) private _challenges;
    mapping(uint256 => mapping(address => Entry)) private _entries;
    mapping(uint256 => address[]) private _participants;

    error ZeroAddress();
    error InvalidChallenge(uint256 id);
    error InvalidStake();
    error InvalidTitle();
    error InvalidDeadlines();
    error WrongStatus(Status expected, Status actual);
    error JoiningClosed();
    error AlreadyJoined();
    error AdminCannotJoin();
    error ParticipantLimitReached();
    error IncorrectStakeReceived();
    error VerificationNotStarted();
    error VerificationClosed();
    error VerificationBatchTooLarge();
    error NotJoined(address player);
    error FinalizationNotAllowed();
    error NotCompleted();
    error AlreadySettled();
    error RecoveryNotAllowed();
    error CancellationClosed();
    error OwnershipRenunciationDisabled();

    event ChallengeCreated(
        uint256 indexed id,
        string title,
        uint256 stake,
        uint64 joinDeadline,
        uint64 endTime,
        uint64 verifyDeadline
    );
    event Joined(uint256 indexed id, address indexed player);
    event Verified(uint256 indexed id, address indexed player, bool completed);
    event Finalized(uint256 indexed id, uint32 winners, uint256 failedPool, uint256 bonusPerWinner);
    event Claimed(uint256 indexed id, address indexed player, uint256 payout);
    event FundsRecovered(uint256 indexed id, address indexed recipient, uint256 amount);
    event Cancelled(uint256 indexed id);
    event Refunded(uint256 indexed id, address indexed player, uint256 amount);

    /// @notice Configure the token and initial administrator; neither may be zero.
    /// @param usdc_ USDC token address; no address is hardcoded.
    /// @param admin Initial owner, validated by OpenZeppelin's Ownable constructor.
    constructor(address usdc_, address admin) Ownable(admin) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    /// @notice Create a challenge with a fixed stake and ordered deadlines.
    /// @return id The newly allocated challenge identifier, starting at one.
    function createChallenge(
        string calldata title,
        uint256 stake,
        uint64 joinDeadline,
        uint64 endTime,
        uint64 verifyDeadline
    ) external onlyOwner returns (uint256 id) {
        if (stake == 0) revert InvalidStake();
        if (bytes(title).length == 0 || bytes(title).length > 80) revert InvalidTitle();
        if (
            block.timestamp >= joinDeadline || joinDeadline > endTime || endTime >= verifyDeadline
        ) revert InvalidDeadlines();

        id = ++challengeCount;
        Challenge storage challenge = _challenges[id];
        challenge.title = title;
        challenge.stake = stake;
        challenge.joinDeadline = joinDeadline;
        challenge.endTime = endTime;
        challenge.verifyDeadline = verifyDeadline;
        challenge.status = Status.Active;
        emit ChallengeCreated(id, title, stake, joinDeadline, endTime, verifyDeadline);
    }

    /// @notice Join before the join deadline after approving the exact stake.
    /// @dev Rejects tokens that deliver less or more than the configured stake.
    function join(uint256 id) external nonReentrant {
        Challenge storage challenge = _getChallenge(id);
        _requireStatus(challenge, Status.Active);
        if (block.timestamp >= challenge.joinDeadline) revert JoiningClosed();
        if (_entries[id][msg.sender].joined) revert AlreadyJoined();
        if (msg.sender == owner()) revert AdminCannotJoin();
        if (challenge.participantCount >= MAX_PARTICIPANTS) revert ParticipantLimitReached();

        _entries[id][msg.sender].joined = true;
        _participants[id].push(msg.sender);
        ++challenge.participantCount;

        uint256 balanceBefore = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), challenge.stake);
        uint256 balanceAfter = usdc.balanceOf(address(this));
        if (balanceAfter < balanceBefore || balanceAfter - balanceBefore != challenge.stake) {
            revert IncorrectStakeReceived();
        }
        emit Joined(id, msg.sender);
    }

    /// @notice Set or clear completion flags in batches of at most 100 players.
    /// @dev Available from endTime through verifyDeadline, both inclusive.
    function setCompletions(uint256 id, address[] calldata players, bool completed) external onlyOwner {
        Challenge storage challenge = _getChallenge(id);
        _requireStatus(challenge, Status.Active);
        if (block.timestamp < challenge.endTime) revert VerificationNotStarted();
        if (block.timestamp > challenge.verifyDeadline) revert VerificationClosed();
        if (players.length > MAX_VERIFICATIONS) revert VerificationBatchTooLarge();

        for (uint256 i; i < players.length; ++i) {
            address player = players[i];
            Entry storage entry = _entries[id][player];
            if (!entry.joined) revert NotJoined(player);
            if (entry.completed != completed) {
                entry.completed = completed;
                if (completed) {
                    ++challenge.completedCount;
                } else {
                    --challenge.completedCount;
                }
            }
            emit Verified(id, player, completed);
        }
    }

    /// @notice Freeze outcomes after the end as owner, or after verification as anyone.
    function finalize(uint256 id) external {
        Challenge storage challenge = _getChallenge(id);
        _requireStatus(challenge, Status.Active);
        if (
            !(msg.sender == owner() && block.timestamp >= challenge.endTime)
                && block.timestamp <= challenge.verifyDeadline
        ) revert FinalizationNotAllowed();

        challenge.status = Status.Finalized;
        uint256 winners = challenge.completedCount;
        if (winners > 0) {
            challenge.failedPool = (uint256(challenge.participantCount) - winners) * challenge.stake;
            challenge.bonusPerWinner = challenge.failedPool / winners;
        }
        emit Finalized(id, challenge.completedCount, challenge.failedPool, challenge.bonusPerWinner);
    }

    /// @notice Claim a winner's stake and bonus; the final winner receives rounding dust.
    function claim(uint256 id) external nonReentrant {
        Challenge storage challenge = _getChallenge(id);
        _requireStatus(challenge, Status.Finalized);
        Entry storage entry = _entries[id][msg.sender];
        if (!entry.joined) revert NotJoined(msg.sender);
        if (!entry.completed) revert NotCompleted();
        if (entry.settled) revert AlreadySettled();

        entry.settled = true;
        ++challenge.claimedCount;
        uint256 payout = _winnerPayout(challenge, challenge.claimedCount == challenge.completedCount);
        usdc.safeTransfer(msg.sender, payout);
        emit Claimed(id, msg.sender, payout);
    }

    /// @notice Recover a nonempty finalized pool only when no player completed.
    function recoverFunds(uint256 id, address recipient) external onlyOwner nonReentrant {
        Challenge storage challenge = _getChallenge(id);
        _requireStatus(challenge, Status.Finalized);
        if (recipient == address(0)) revert ZeroAddress();
        if (
            challenge.completedCount != 0 || challenge.participantCount == 0 || challenge.fundsRecovered
        ) revert RecoveryNotAllowed();

        challenge.fundsRecovered = true;
        uint256 amount = challenge.stake * uint256(challenge.participantCount);
        usdc.safeTransfer(recipient, amount);
        emit FundsRecovered(id, recipient, amount);
    }

    /// @notice Cancel an active challenge strictly before its end, enabling refunds.
    function cancelChallenge(uint256 id) external onlyOwner {
        Challenge storage challenge = _getChallenge(id);
        _requireStatus(challenge, Status.Active);
        if (block.timestamp >= challenge.endTime) revert CancellationClosed();
        challenge.status = Status.Cancelled;
        emit Cancelled(id);
    }

    /// @notice Retrieve your stake once from a cancelled challenge.
    function refund(uint256 id) external nonReentrant {
        Challenge storage challenge = _getChallenge(id);
        _requireStatus(challenge, Status.Cancelled);
        Entry storage entry = _entries[id][msg.sender];
        if (!entry.joined) revert NotJoined(msg.sender);
        if (entry.settled) revert AlreadySettled();

        entry.settled = true;
        usdc.safeTransfer(msg.sender, challenge.stake);
        emit Refunded(id, msg.sender, challenge.stake);
    }

    /// @notice Return challenge details; invalid identifiers revert.
    function getChallenge(uint256 id) external view returns (Challenge memory) {
        return _getChallenge(id);
    }

    /// @notice Return a player's entry for an existing challenge.
    function getEntry(uint256 id, address player) external view returns (Entry memory) {
        _getChallenge(id);
        return _entries[id][player];
    }

    /// @notice Return a participant page, clamping limit to the remaining entries.
    /// @dev An offset at or beyond the participant count returns an empty array.
    function getParticipants(uint256 id, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        _getChallenge(id);
        address[] storage participants = _participants[id];
        uint256 count = participants.length;
        if (offset >= count) return new address[](0);
        uint256 remaining = count - offset;
        if (limit > remaining) limit = remaining;
        page = new address[](limit);
        for (uint256 i; i < limit; ++i) {
            page[i] = participants[offset + i];
        }
    }

    /// @notice Return what a winner could claim now, including dust if last to claim.
    /// @dev Returns zero unless finalized, joined, completed, and not yet settled.
    function pendingPayout(uint256 id, address player) external view returns (uint256) {
        Challenge storage challenge = _getChallenge(id);
        Entry storage entry = _entries[id][player];
        if (challenge.status != Status.Finalized || !entry.joined || !entry.completed || entry.settled) {
            return 0;
        }
        return _winnerPayout(
            challenge, uint256(challenge.claimedCount) + 1 == challenge.completedCount
        );
    }

    /// @notice Return the total originally staked, not the remaining unclaimed balance.
    function poolOf(uint256 id) external view returns (uint256) {
        Challenge storage challenge = _getChallenge(id);
        return challenge.stake * uint256(challenge.participantCount);
    }

    /// @notice Ownership cannot be renounced; use the inherited two-step transfer instead.
    function renounceOwnership() public override onlyOwner {
        revert OwnershipRenunciationDisabled();
    }

    function _getChallenge(uint256 id) private view returns (Challenge storage challenge) {
        if (id == 0 || id > challengeCount) revert InvalidChallenge(id);
        return _challenges[id];
    }

    function _requireStatus(Challenge storage challenge, Status expected) private view {
        if (challenge.status != expected) revert WrongStatus(expected, challenge.status);
    }

    function _winnerPayout(Challenge storage challenge, bool lastWinner) private view returns (uint256 payout) {
        payout = challenge.stake + challenge.bonusPerWinner;
        if (lastWinner) {
            payout += challenge.failedPool - challenge.bonusPerWinner * uint256(challenge.completedCount);
        }
    }
}
