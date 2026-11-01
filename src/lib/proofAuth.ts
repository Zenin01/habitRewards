// Shared by the browser and the proofs API so both sides sign and verify the exact same text.

export const MAX_PROOF_LEN = 500
export const MAX_PROOFS_PER_PLAYER = 5
export const SESSION_TTL_SEC = 23 * 3600
export const SUBMIT_SKEW_SEC = 600

export interface ProofRecord {
  player: string
  text: string
  at: number
}

export interface SubmitFields {
  arena: string
  challengeId: number
  player: string
  text: string
  timestamp: number
}

export interface SessionFields {
  arena: string
  viewer: string
  timestamp: number
}

/** Signed by a player to attach proof to a challenge. Free: no gas, no funds move. */
export function submitMessage(f: SubmitFields): string {
  return [
    'Stake & Sweat proof',
    `Arena: ${f.arena.toLowerCase()}`,
    `Challenge: ${f.challengeId}`,
    `Player: ${f.player.toLowerCase()}`,
    `Time: ${f.timestamp}`,
    `Proof: ${JSON.stringify(f.text)}`,
  ].join('\n')
}

/** Signed once per browser session to read proofs. Free: no gas, no funds move. */
export function sessionMessage(f: SessionFields): string {
  return [
    'Stake & Sweat: view proofs',
    `Arena: ${f.arena.toLowerCase()}`,
    `Wallet: ${f.viewer.toLowerCase()}`,
    `Time: ${f.timestamp}`,
    'Signing does not cost gas and cannot move your funds.',
  ].join('\n')
}
