import { useState } from 'react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { useEnsureChain } from '@/hooks/useEnsureChain'
import { CHAIN_ID } from '@/lib/stake'
import { parseTxError } from '@/lib/errors'
import { TxButton } from './ui'

/** Shown when a connected wallet is on a network other than Arc Testnet. */
export function NetworkBanner() {
  const { isConnected, chainId } = useAccount()
  const ensureChain = useEnsureChain()
  const [busy, setBusy] = useState(false)

  if (!isConnected || chainId === CHAIN_ID) return null

  const switchNow = async () => {
    setBusy(true)
    try {
      await ensureChain()
      toast.success('Wallet is on Arc Testnet')
    } catch (error) {
      toast.error(parseTxError(error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="glass-card mt-4 rounded-3xl p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--warn)' }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Your wallet is on the wrong network</p>
          <p className="mt-0.5 text-pretty text-xs" style={{ color: 'var(--muted)' }}>
            Stake &amp; Sweat runs on Arc Testnet (chain 5042002). Using Phantom? Turn on Settings, Developer Settings,
            Testnet Mode, make sure Arc is on under Active Networks, then press the button.
          </p>
          <div className="mt-3">
            <TxButton status={busy ? 'signing' : 'idle'} onClick={switchNow}>
              Switch to Arc Testnet
            </TxButton>
          </div>
        </div>
      </div>
    </div>
  )
}
