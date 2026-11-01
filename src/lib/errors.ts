import { BaseError, ContractFunctionRevertedError } from 'viem'

const REVERT_MESSAGES: Record<string, string> = {
  InvalidChallenge: 'That challenge does not exist.',
  InvalidStake: 'Stake must be more than zero.',
  InvalidTitle: 'Title must be 1 to 80 characters.',
  InvalidDeadlines: 'Deadlines must be in the future and in order.',
  WrongStatus: 'That challenge is not in the right state for this action.',
  JoiningClosed: 'Joining has closed for this challenge.',
  AlreadyJoined: 'You already joined this challenge.',
  AdminCannotJoin: 'The admin cannot play in their own challenges.',
  ParticipantLimitReached: 'This challenge is full.',
  IncorrectStakeReceived: 'The token delivered the wrong amount.',
  VerificationNotStarted: 'Verification opens once the challenge ends.',
  VerificationClosed: 'The verification window has closed.',
  VerificationBatchTooLarge: 'Verify at most 100 players at a time.',
  NotJoined: 'That wallet did not join this challenge.',
  FinalizationNotAllowed: 'Settling is not available yet.',
  NotCompleted: 'You were not verified as completed.',
  AlreadySettled: 'Already paid out.',
  RecoveryNotAllowed: 'Recovery only works when nobody completed.',
  CancellationClosed: 'A challenge cannot be cancelled once it has ended.',
  OwnableUnauthorizedAccount: 'Only the admin can do that.',
  ZeroAddress: 'Address cannot be empty.',
}

export class ChainSwitchError extends Error {}

export function parseTxError(error: unknown): { message: string; cancelled: boolean } {
  if (error instanceof ChainSwitchError) return { message: error.message, cancelled: false }
  if (error instanceof BaseError) {
    const lower = error.message.toLowerCase()
    if (lower.includes('does not match the target chain')) {
      return { message: 'Please switch your wallet to Arc Testnet, then try again.', cancelled: false }
    }
    if (lower.includes('user rejected') || lower.includes('user denied')) {
      return { message: 'Transaction cancelled.', cancelled: true }
    }
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName
      if (name && REVERT_MESSAGES[name]) return { message: REVERT_MESSAGES[name], cancelled: false }
    }
    if (lower.includes('insufficient funds') || lower.includes('exceeds balance')) {
      return {
        message: 'Not enough USDC for this and for gas. Use Get test USDC in the sidebar.',
        cancelled: false,
      }
    }
    if (lower.includes('exceeds allowance') || lower.includes('insufficient allowance')) {
      return { message: 'Approve USDC first.', cancelled: false }
    }
    return { message: error.shortMessage || 'Transaction failed. Please try again.', cancelled: false }
  }
  return { message: 'Something went wrong. Please try again.', cancelled: false }
}
