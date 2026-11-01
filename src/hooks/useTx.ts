import { useCallback, useState } from 'react'
import { usePublicClient, useWriteContract } from 'wagmi'
import { useEnsureChain } from './useEnsureChain'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Abi, Address, Hash } from 'viem'
import { CHAIN_ID } from '@/lib/stake'
import { parseTxError } from '@/lib/errors'

export type TxStatus = 'idle' | 'signing' | 'confirming'

export interface TxCall {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

/** Sends one contract write on Arc Testnet, waits for the receipt, then refreshes all reads. */
export function useTx() {
  const ensureChain = useEnsureChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<TxStatus>('idle')
  const [lastHash, setLastHash] = useState<Hash | null>(null)

  const run = useCallback(
    async (call: TxCall, successMessage: string): Promise<boolean> => {
      try {
        await ensureChain()
        setStatus('signing')
        const hash = await writeContractAsync({
          address: call.address,
          abi: call.abi,
          functionName: call.functionName,
          args: call.args,
          chainId: CHAIN_ID,
        })
        setLastHash(hash)
        setStatus('confirming')
        const receipt = await publicClient?.waitForTransactionReceipt({ hash })
        if (receipt && receipt.status !== 'success') {
          toast.error('Transaction reverted onchain.')
          return false
        }
        toast.success(successMessage)
        await queryClient.invalidateQueries()
        return true
      } catch (error) {
        const parsed = parseTxError(error)
        if (parsed.cancelled) toast(parsed.message)
        else toast.error(parsed.message)
        return false
      } finally {
        setStatus('idle')
      }
    },
    [ensureChain, writeContractAsync, publicClient, queryClient],
  )

  return { run, status, busy: status !== 'idle', lastHash }
}
