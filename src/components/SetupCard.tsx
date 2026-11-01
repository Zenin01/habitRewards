import { useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useAccount, useDeployContract, usePublicClient } from 'wagmi'
import { useEnsureChain } from '@/hooks/useEnsureChain'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { Dumbbell, Rocket } from 'lucide-react'
import { STAKE_SWEAT_ABI, STAKE_SWEAT_BYTECODE } from '@/contract/stakeSweat'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/stake'
import { parseTxError } from '@/lib/errors'
import { Card, Label, TxButton } from './ui'

export function SetupCard({ onReady }: { onReady: (address: Address) => void }) {
  const { address, isConnected } = useAccount()
  const ensureChain = useEnsureChain()
  const { deployContractAsync } = useDeployContract()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const [phase, setPhase] = useState<'idle' | 'signing' | 'confirming'>('idle')
  const [existing, setExisting] = useState('')

  const deploy = async () => {
    if (!address) return
    try {
      await ensureChain()
      setPhase('signing')
      const hash = await deployContractAsync({
        abi: STAKE_SWEAT_ABI,
        bytecode: STAKE_SWEAT_BYTECODE,
        args: [USDC_ADDRESS, address],
        chainId: CHAIN_ID,
      })
      setPhase('confirming')
      const receipt = await publicClient?.waitForTransactionReceipt({ hash })
      if (receipt?.status === 'success' && receipt.contractAddress) {
        toast.success('Your arena is live. You are the admin.')
        onReady(receipt.contractAddress)
      } else {
        toast.error('Deployment failed onchain.')
      }
    } catch (error) {
      const parsed = parseTxError(error)
      if (parsed.cancelled) toast(parsed.message)
      else toast.error(parsed.message)
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex size-11 items-center justify-center rounded-2xl" style={{ background: 'var(--accent)' }}>
          <Dumbbell className="size-5 text-white" />
        </div>
        <h2 className="display mt-4 text-balance text-2xl font-bold">Open your arena</h2>
        <p className="mt-2 text-pretty text-sm" style={{ color: 'var(--muted)' }}>
          Deploy your own Stake &amp; Sweat contract on Arc Testnet. The wallet you deploy with becomes the admin who
          creates challenges, verifies who finished, and recovers the pool if nobody does.
        </p>
        <div className="mt-5">
          {isConnected ? (
            <TxButton status={phase} onClick={deploy}>
              <Rocket className="size-4" /> Deploy arena
            </TxButton>
          ) : (
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button type="button" onClick={show} className="btn-primary min-h-11 w-full rounded-2xl px-4 text-sm font-semibold">
                  Connect wallet to deploy
                </button>
              )}
            </ConnectKitButton.Custom>
          )}
        </div>
        <p className="mt-3 text-center text-[11px]" style={{ color: 'var(--subtle)' }}>
          Gas is paid in USDC. Use Get test USDC in the sidebar if your wallet is empty.
        </p>
      </Card>

      <Card>
        <Label>Joining a friend's arena?</Label>
        <div className="mt-2 flex gap-2">
          <input
            value={existing}
            onChange={(e) => setExisting(e.target.value.trim())}
            placeholder="Paste arena contract address"
            spellCheck={false}
            className="glass-inner field mono min-w-0 flex-1 rounded-2xl px-3.5 py-2.5 text-xs outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            disabled={!isAddress(existing)}
            onClick={() => onReady(existing as Address)}
            className="btn-primary min-h-11 rounded-2xl px-4 text-sm font-semibold disabled:opacity-45"
          >
            Open
          </button>
        </div>
      </Card>
    </div>
  )
}
