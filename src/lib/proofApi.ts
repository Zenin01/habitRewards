import type { ProofRecord } from './proofAuth'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/proofs/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as ({ error?: string } & Record<string, unknown>) | null
  if (!res.ok) throw new Error(data?.error ?? 'Request failed. Please try again.')
  return data as T
}

export interface SubmitPayload {
  arena: string
  challengeId: number
  player: string
  text: string
  timestamp: number
  signature: string
}

export interface ListPayload {
  arena: string
  challengeId: number
  viewer: string
  timestamp: number
  signature: string
}

export const submitProofRequest = (payload: SubmitPayload) => post<{ proofs: ProofRecord[] }>('submit', payload)

export const listProofsRequest = (payload: ListPayload) =>
  post<{ role: 'admin' | 'player'; proofs: ProofRecord[] }>('list', payload)
