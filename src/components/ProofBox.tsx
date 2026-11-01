import { useState } from 'react'
import type { Address } from 'viem'
import { toast } from 'sonner'
import { proofErrorText, useProofs } from '@/hooks/useProofs'
import { MAX_PROOF_LEN } from '@/lib/proofAuth'
import { fmtDate } from '@/lib/stake'
import { Label, TxButton } from './ui'
import { ProofText } from './ProofText'

/** Lets a player attach a link or note as proof of their habit. Free to submit: it only needs a wallet signature. */
export function ProofBox({ contract, challengeId }: { contract: Address; challengeId: number }) {
  const { data, loading, load, submit } = useProofs(contract, challengeId)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    try {
      await submit(text.trim())
      setText('')
      toast.success('Proof sent to the admin')
    } catch (error) {
      toast.error(proofErrorText(error))
    } finally {
      setBusy(false)
    }
  }

  const show = async () => {
    try {
      await load()
    } catch (error) {
      toast.error(proofErrorText(error))
    }
  }

  return (
    <div className="glass-inner space-y-2 rounded-2xl p-3.5">
      <Label>Your proof</Label>
      <textarea
        value={text}
        maxLength={MAX_PROOF_LEN}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Paste a link (Strava, photo, video) or write a short note"
        className="field w-full resize-none rounded-xl bg-white/50 px-3 py-2 text-sm outline-none placeholder:text-slate-400"
      />
      <TxButton variant="ghost" status={busy ? 'signing' : 'idle'} disabled={text.trim().length === 0} onClick={send}>
        Submit proof (free)
      </TxButton>
      <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>
        You sign a message in your wallet. No gas, no funds move. Only you and the admin can see it.
      </p>

      {data ? (
        data.proofs.length > 0 ? (
          <ul className="space-y-1.5 pt-1">
            {data.proofs.map((p) => (
              <li key={`${p.at}-${p.text}`} className="rounded-xl bg-white/50 px-3 py-2">
                <div className="text-[10px]" style={{ color: 'var(--subtle)' }}>
                  {fmtDate(p.at)}
                </div>
                <ProofText text={p.text} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            No proof submitted yet.
          </p>
        )
      ) : (
        <button
          type="button"
          onClick={() => void show()}
          disabled={loading}
          className="min-h-9 text-[11px] font-semibold underline disabled:opacity-45"
          style={{ color: 'var(--muted)' }}
        >
          Show proofs I already sent
        </button>
      )}
    </div>
  )
}
