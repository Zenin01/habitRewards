import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { buildShareLink } from '@/lib/share'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { CHAIN_ID, shortAddr } from '@/lib/stake'

interface Props {
  contract: Address
  isPinned: boolean
  isAdmin: boolean
  onSwitch: () => void
}

export function ArenaFooter({ contract, isPinned, isAdmin, onSwitch }: Props) {
  const [invite, setInvite] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    void buildShareLink(`/?arena=${contract}`).then((url) => {
      if (alive) setInvite(url)
    })
    return () => {
      alive = false
    }
  }, [contract])

  const copy = async () => {
    if (!invite) return
    try {
      await navigator.clipboard.writeText(invite)
      setCopied(true)
      toast.success('Invite link copied')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy. Select the address manually.')
    }
  }

  return (
    <footer className="glass-inner mt-6 space-y-3 rounded-3xl px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--subtle)' }}>
            Arena contract
          </div>
          <a
            href={buildAddressExplorerUrl(CHAIN_ID, contract)}
            target="_blank"
            rel="noopener noreferrer"
            className="mono inline-flex items-center gap-1 text-xs"
            style={{ color: 'var(--accent-hover)' }}
          >
            {shortAddr(contract)} <ExternalLink className="size-3" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!invite}
          className="glass-pill inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-xs font-semibold disabled:opacity-45"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          Copy invite link
        </button>
      </div>
      {isAdmin && !isPinned ? (
        <p className="text-pretty text-[11px]" style={{ color: 'var(--muted)' }}>
          Share the invite link so players land in your arena. Your arena is saved in this browser only.
        </p>
      ) : null}
      <button type="button" onClick={onSwitch} className="text-[11px] font-semibold underline" style={{ color: 'var(--muted)' }}>
        Use a different arena
      </button>
    </footer>
  )
}
