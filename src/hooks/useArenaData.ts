import { useMemo } from 'react'
import { erc20Abi, type Address } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import { STAKE_SWEAT_ABI } from '@/contract/stakeSweat'
import { CHAIN_ID, USDC_ADDRESS, toChallenge, type Challenge, type Entry } from '@/lib/stake'

const POLL_MS = 10_000

export interface PlayerState {
  entry: Entry
  payout: bigint
}

/** Reads the arena contract: owner, every challenge, and the connected wallet's entries and USDC. */
export function useArenaData(contract: Address) {
  const { address: me } = useAccount()
  const base = { address: contract, abi: STAKE_SWEAT_ABI, chainId: CHAIN_ID } as const

  const head = useReadContracts({
    contracts: [
      { ...base, functionName: 'owner' },
      { ...base, functionName: 'challengeCount' },
    ],
    query: { refetchInterval: POLL_MS },
  })

  const owner = head.data?.[0]?.result
  const count = Number(head.data?.[1]?.result ?? 0n)
  const ids = useMemo(() => Array.from({ length: count }, (_, i) => i + 1), [count])

  const challengesQ = useReadContracts({
    contracts: ids.map((id) => ({ ...base, functionName: 'getChallenge', args: [BigInt(id)] }) as const),
    query: { enabled: count > 0, refetchInterval: POLL_MS },
  })

  const playerQ = useReadContracts({
    contracts: me
      ? ids.flatMap((id) => [
          { ...base, functionName: 'getEntry', args: [BigInt(id), me] } as const,
          { ...base, functionName: 'pendingPayout', args: [BigInt(id), me] } as const,
        ])
      : [],
    query: { enabled: Boolean(me) && count > 0, refetchInterval: POLL_MS },
  })

  const walletQ = useReadContracts({
    contracts: me
      ? [
          { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [me], chainId: CHAIN_ID },
          { address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance', args: [me, contract], chainId: CHAIN_ID },
        ]
      : [],
    query: { enabled: Boolean(me), refetchInterval: POLL_MS },
  })

  const challenges: Challenge[] = useMemo(() => {
    const list: Challenge[] = []
    ids.forEach((id, i) => {
      const res = challengesQ.data?.[i]
      if (res?.status === 'success') list.push(toChallenge(id, res.result))
    })
    return list.reverse()
  }, [ids, challengesQ.data])

  const players = useMemo(() => {
    const map = new Map<number, PlayerState>()
    ids.forEach((id, i) => {
      const entryRes = playerQ.data?.[i * 2]
      const payoutRes = playerQ.data?.[i * 2 + 1]
      if (entryRes?.status === 'success') {
        map.set(id, {
          entry: entryRes.result as Entry,
          payout: payoutRes?.status === 'success' ? (payoutRes.result as bigint) : 0n,
        })
      }
    })
    return map
  }, [ids, playerQ.data])

  const balance = walletQ.data?.[0]?.status === 'success' ? (walletQ.data[0].result) : undefined
  const allowance = walletQ.data?.[1]?.status === 'success' ? (walletQ.data[1].result) : 0n

  return {
    me,
    owner,
    isAdmin: Boolean(me && owner && me.toLowerCase() === owner.toLowerCase()),
    challenges,
    players,
    balance,
    allowance,
    loading: head.isLoading || (count > 0 && challengesQ.isLoading),
    contractMissing: head.isFetched && head.data?.[0]?.status === 'failure',
  }
}
