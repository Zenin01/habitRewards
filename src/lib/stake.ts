import { arcTestnet } from 'viem/chains'
import type { Address } from 'viem'
import { formatUnitsFixed, parseUnitsExact } from '@/onchain-money'
import { USDC_DECIMALS, getUsdc } from '@/onchain-facts'

export const CHAIN_ID = arcTestnet.id

const usdcFact = getUsdc(CHAIN_ID)
if (!usdcFact) throw new Error('USDC is not registered for Arc Testnet')
export const USDC_ADDRESS = usdcFact.address as Address
export const USDC_DECIMALS_ON_CHAIN = usdcFact.decimals ?? USDC_DECIMALS

export const nowSec = (): number => Math.floor(Date.now() / 1000)

export type ChallengeStatus = 0 | 1 | 2 // Active, Finalized, Cancelled

export interface Challenge {
  id: number
  title: string
  stake: bigint
  joinDeadline: number
  endTime: number
  verifyDeadline: number
  status: ChallengeStatus
  participantCount: number
  completedCount: number
  claimedCount: number
  fundsRecovered: boolean
  bonusPerWinner: bigint
  failedPool: bigint
}

export interface Entry {
  joined: boolean
  completed: boolean
  settled: boolean
}

export type Phase = 'open' | 'live' | 'verifying' | 'settle' | 'settled' | 'cancelled'

export function phaseOf(c: Challenge, now: number): Phase {
  if (c.status === 2) return 'cancelled'
  if (c.status === 1) return 'settled'
  if (now < c.joinDeadline) return 'open'
  if (now < c.endTime) return 'live'
  if (now <= c.verifyDeadline) return 'verifying'
  return 'settle'
}

export const PHASE_LABEL: Record<Phase, string> = {
  open: 'Open to join',
  live: 'In progress',
  verifying: 'Verifying',
  settle: 'Ready to settle',
  settled: 'Settled',
  cancelled: 'Cancelled',
}

export function fmtUsdc(raw: bigint, digits = 2): string {
  return formatUnitsFixed(raw, USDC_DECIMALS_ON_CHAIN, digits)
}

export function parseStake(value: string): bigint | null {
  try {
    const raw = parseUnitsExact(value, USDC_DECIMALS_ON_CHAIN)
    return raw > 0n ? raw : null
  } catch {
    return null
  }
}

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

export function fmtDate(sec: number): string {
  return new Date(sec * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/** Next deadline the user cares about, with a human label. */
export function nextMilestone(c: Challenge, now: number): { label: string; at: number } | null {
  switch (phaseOf(c, now)) {
    case 'open':
      return { label: 'Joining closes', at: c.joinDeadline }
    case 'live':
      return { label: 'Challenge ends', at: c.endTime }
    case 'verifying':
      return { label: 'Verification closes', at: c.verifyDeadline }
    default:
      return null
  }
}

export function toChallenge(id: number, raw: {
  title: string
  stake: bigint
  joinDeadline: bigint
  endTime: bigint
  verifyDeadline: bigint
  status: number
  participantCount: number
  completedCount: number
  claimedCount: number
  fundsRecovered: boolean
  bonusPerWinner: bigint
  failedPool: bigint
}): Challenge {
  return {
    id,
    title: raw.title,
    stake: raw.stake,
    joinDeadline: Number(raw.joinDeadline),
    endTime: Number(raw.endTime),
    verifyDeadline: Number(raw.verifyDeadline),
    status: raw.status as ChallengeStatus,
    participantCount: Number(raw.participantCount),
    completedCount: Number(raw.completedCount),
    claimedCount: Number(raw.claimedCount),
    fundsRecovered: raw.fundsRecovered,
    bonusPerWinner: raw.bonusPerWinner,
    failedPool: raw.failedPool,
  }
}
