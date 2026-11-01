import { useCallback, useState } from 'react'
import { BaseError, type Address } from 'viem'
import { useAccount, useSignMessage } from 'wagmi'
import { listProofsRequest, submitProofRequest } from '@/lib/proofApi'
import { SESSION_TTL_SEC, sessionMessage, submitMessage, type ProofRecord } from '@/lib/proofAuth'
import { parseTxError } from '@/lib/errors'
import { nowSec } from '@/lib/stake'

interface Session {
  timestamp: number
  signature: string
}

interface ProofData {
  role: 'admin' | 'player'
  proofs: ProofRecord[]
}

const sessionKey = (arena: string, wallet: string) => `stake-sweat:proof-session:${arena.toLowerCase()}:${wallet.toLowerCase()}`

function readSession(arena: string, wallet: string): Session | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(arena, wallet))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    return nowSec() - parsed.timestamp < SESSION_TTL_SEC ? parsed : null
  } catch {
    return null
  }
}

function saveSession(arena: string, wallet: string, session: Session) {
  try {
    sessionStorage.setItem(sessionKey(arena, wallet), JSON.stringify(session))
  } catch {
    // storage unavailable: the user will simply sign again next time
  }
}

export function proofErrorText(error: unknown): string {
  if (error instanceof Error && !(error instanceof BaseError)) return error.message
  return parseTxError(error).message
}

/**
 * Habit proofs for one challenge. Proofs live on the app server, not onchain.
 * Reading proofs needs a free wallet signature (once per browser session); submitting signs each proof.
 */
export function useProofs(arena: Address, challengeId: number) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [data, setData] = useState<ProofData | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async () => {
      if (!address) return
      let session = readSession(arena, address)
      if (!session) {
        const timestamp = nowSec()
        const signature = await signMessageAsync({ message: sessionMessage({ arena, viewer: address, timestamp }) })
        session = { timestamp, signature }
        saveSession(arena, address, session)
      }
      setLoading(true)
      try {
        const res = await listProofsRequest({ arena, challengeId, viewer: address, ...session })
        setData(res)
      } finally {
        setLoading(false)
      }
    },
    [address, arena, challengeId, signMessageAsync],
  )

  const submit = useCallback(
    async (text: string) => {
      if (!address) throw new Error('Connect your wallet first.')
      const timestamp = nowSec()
      const signature = await signMessageAsync({
        message: submitMessage({ arena, challengeId, player: address, text, timestamp }),
      })
      const res = await submitProofRequest({ arena, challengeId, player: address, text, timestamp, signature })
      setData({ role: 'player', proofs: res.proofs })
    },
    [address, arena, challengeId, signMessageAsync],
  )

  return { data, loading, load, submit }
}
